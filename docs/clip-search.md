# CLIP-based search — how it works

BeeldenSearch supports three cross-modal retrieval modes, all served by the
same FastAPI route and backed by the same CLIP image embedding index:

| Mode | Input | Output |
|---|---|---|
| **Text → image** | Natural-language prompt (`"factory workers on a machine"`) | Top-K Openbeelden records whose thumbnails most resemble the prompt |
| **Image → image** | Uploaded image file | Top-K records whose thumbnails are visually nearest |
| **Similar-by-id** | An existing record identifier | Top-K nearest neighbours of that record's thumbnail |

All three end up performing inner-product nearest-neighbour search on a FAISS
index of L2-normalized CLIP ViT-B/32 image embeddings. Only the query-side
encoder differs.

---

## Architecture at a glance

```
                   ┌──── offline (build once) ────┐
                   │                              │
   oai_oi JSONL ─▶ │ data_pipeline/embed_clip.py  │ ─▶ data/faiss/
   thumbnails/*.png│  - CLIP image encoder        │     clip.index   (FAISS IP)
                   │  - L2-normalize              │     clip.meta.pkl ([(id, path), …])
                   └──────────────────────────────┘
                                                          ▲
                   ┌──── online (per request) ────┐       │ read once
                   │                              │       │ at first query
   text prompt  ─▶ │   backend/app/multimodal.py  │ ──────┘
   image upload ─▶ │   _ClipState  (singleton)    │
   identifier   ─▶ │   - lazy CLIP + FAISS load   │
                   │   - encode (text | image)    │ ─▶ FAISS.search(k)
                   │   - reconstruct(row) for id  │    ↓
                   │                              │    top-K (id, score)
                   └──────────────────────────────┘    ↓
                                                       OpenSearch mget
                                                       → full Hit[] with
                                                         title / year /
                                                         thumbnail_url / …
```

Two files carry almost all the logic:

- **`data_pipeline/embed_clip.py`** — offline: builds the FAISS index from
  the downloaded thumbnails. Run once per corpus refresh.
- **`backend/app/multimodal.py`** — online: the `/multimodal_search`
  endpoint + the `_ClipState` singleton that holds the CLIP model and the
  FAISS index in memory.

Everything else (`config.py`, `main.py`, `search.py`) is glue.

---

## Offline — building the index

**File:** `data_pipeline/embed_clip.py`

### Inputs

- A JSONL of records with an `identifier` field (any JSONL produced by
  `harvest.py` or `enrich_ner.py` works — the script ignores all other
  fields except `identifier`).
- `data/thumbnails/<id_tail>.{png,jpg,jpeg,webp}` — already downloaded by
  `data_pipeline/download_thumbnails.py`.

### CLI

```bash
python -m data_pipeline.embed_clip \
    --records data/enriched/openbeelden-YYYYMMDD.jsonl \
    --thumbnails data/thumbnails \
    --index-path data/faiss/clip.index \
    --meta-path  data/faiss/clip.meta.pkl \
    --model      ViT-B-32 \
    --pretrained laion2b_s34b_b79k \
    --batch-size 32
```

### Flow (`build_index`, `data_pipeline/embed_clip.py:47`)

1. **Load CLIP** via `open_clip.create_model_and_transforms(...)` on CUDA if
   available, else CPU. Returns `(model, preprocess)`. Set `.eval()`.
2. **Pair up** records with thumbnails. For each record, take the numeric
   tail of the `oai:openimages.eu:NNN` identifier, look for
   `<tail>.{png,jpg,jpeg,webp}` in the thumbnails dir. Records without a
   resolvable thumbnail are silently dropped.
   - Helper: `_resolve_thumbnail_path(tail, thumb_dir)` at
     `data_pipeline/embed_clip.py:34`.
3. **Encode in batches** of `batch_size` (default 32):
   - `Image.open(path).convert("RGB")` → `preprocess(…)` → batched tensor.
   - `torch.stack(...).to(device)` → `model.encode_image(batch)`.
   - **L2-normalize**: `feats / feats.norm(dim=-1, keepdim=True)`.
     Normalizing makes inner product equal to cosine similarity, which is
     what CLIP's contrastive training assumes.
   - Move to CPU, cast `float32`, append to an in-memory list.
   - Unreadable images are skipped per-item; the `pairs` list is rewritten
     in-place to stay aligned with the embedding matrix.
4. **Concatenate** all per-batch matrices → single `(N, 512)` array.
5. **Build FAISS index**:
   - `faiss.IndexFlatIP(dim)` — exact inner-product search. At N ≤ a few
     thousand vectors this is trivial; swap for `IndexHNSWFlat` past ~50k.
   - `index.add(matrix)` — index row `i` holds the vector for `pairs[i]`.
6. **Persist** two files under `data/faiss/`:
   - `clip.index` — the FAISS index (400 KB for 193×512 floats).
   - `clip.meta.pkl` — the list of `(identifier, thumbnail_path)` pairs,
     aligned row-for-row with the index. Pickled because FAISS only stores
     numeric vectors, not string ids.

### Why these choices

| Choice | Reason |
|---|---|
| **ViT-B/32 LAION-2B** | Strong zero-shot on Dutch archival imagery, widely replicated, 512-d, ~600 MB weights. Punches well above its size for this scale. |
| **L2-normalize + `IndexFlatIP`** | Cosine similarity with an exact index. No recall loss; ANN only becomes worth it past ~10⁵ vectors. |
| **Pickle for metadata** | FAISS can't store strings. A parallel array keeps the schema trivial; no external DB needed. |
| **Batch decode in PIL, not `torchvision.io`** | The HPC conda has a broken torchvision image extension. PIL is the safer default. |

---

## Online — serving `/multimodal_search`

**File:** `backend/app/multimodal.py`

### The `_ClipState` singleton (`multimodal.py:42`)

All heavy state lives on one threadsafe singleton, loaded lazily:

- `_model`, `_preprocess`, `_tokenizer` — the CLIP pieces.
- `_device` — `"cuda"` if available, else `"cpu"`.
- `_index` — the FAISS `IndexFlatIP` read from disk.
- `_ids: list[str]`, `_paths: list[Path]` — materialized from
  `clip.meta.pkl`, row-aligned with `_index`.
- `_id_to_row: dict[str, int]` — reverse index, so "similar to this id"
  can look up the embedding row in O(1).

First call to any endpoint hits `ensure_loaded()` which acquires a lock,
loads weights + index, and builds `_id_to_row`. All later calls short-circuit.
This keeps backend startup fast — the ~1.5 s CLIP load is paid by the first
request, not at import time.

If the FAISS files are missing (e.g. pipeline wasn't run yet), the state
loads everything else successfully and `/multimodal_search` 503s with
`"FAISS index unavailable"` instead of crashing the whole backend.

### Three modes, three encoders, one search

**Text → image** — `GET /multimodal_search?q=…&k=24`, handler
`multimodal_search_text` at `multimodal.py:171`:

```
text  ──▶  tokenizer(text)  ──▶  model.encode_text  ──▶  L2-normalize  ──▶  FAISS.search(k)
```

`_ClipState.encode_text()` at `multimodal.py:104`. Vector is `float32`,
shape `(1, 512)`.

**Image → image** — `POST /multimodal_search` with `image=<file>` (multipart),
handler `multimodal_search_upload` at `multimodal.py:196`:

```
bytes  ──▶  PIL.Image.open  ──▶  preprocess  ──▶  model.encode_image  ──▶  L2-normalize  ──▶  FAISS.search(k)
```

`_ClipState.encode_image()` at `multimodal.py:113`.

**Similar-by-id** — `POST /multimodal_search` with `identifier=oai:…`
(same handler, different branch at `multimodal.py:211`):

```
id  ──▶  id_to_row[id]  ──▶  FAISS.reconstruct(row)  ──▶  FAISS.search(k+1)  ──▶  drop self-hit
```

Note: `FAISS.reconstruct(row)` returns the stored vector — no CLIP
inference needed at all. This is why similar-by-id is the fastest path
(~3 ms on H100).

### From (id, score) to `Hit` objects — `_fetch_hits_by_ids`

FAISS returns numeric ids (embedding rows) and similarity scores; we map
rows → `oai:...` identifiers via `_ClipState._ids`, then batch-fetch the
full source documents from OpenSearch with a single `mget` call. The Hit
schema is shared with `/search` so the frontend renders them with the same
`ResultCard` / `VisualCard` components.

- Helper: `_fetch_hits_by_ids(client, index, ids, scores)` at
  `multimodal.py:146`.
- Scores from FAISS (cosine similarity in `[-1, 1]`) are passed through
  as the Hit `score`. In practice text→image hits usually score 0.20–0.35;
  image→image warm hits reach 0.6+; self-similarity = 1.0 exactly.

### Full request trace (text query)

For `GET /multimodal_search?q=factory+workers+machine&k=24`:

1. FastAPI binds `q="factory workers machine"`, `k=24`.
2. `_STATE.ensure_loaded()` — no-op after first call.
3. `vec = _STATE.encode_text("factory workers machine")` →
   `np.float32[1, 512]`, L2-normalized. ~6 ms on H100.
4. `pairs = _STATE.search(vec, 24)` →
   `[(oai:openimages.eu:…, 0.316), (…, 0.301), …]` (24 entries, sorted
   desc by score). FAISS does ≤ 1 ms for 193 vectors.
5. `hits = _fetch_hits_by_ids(os_client, "openbeelden", ids, scores)` —
   one OpenSearch `_mget` round-trip, ~3 ms.
6. Return `MultimodalResponse(mode="text", took_ms=9, hits=[…])`.

---

## Design decisions — in one table

| Question | Choice | Rationale |
|---|---|---|
| Where to store embeddings? | FAISS flat index + pickled row-id metadata on disk | Zero external deps at query time; cold start only reads two files. |
| Store text embeddings too? | No. Image-only. | Text encoder runs at query time in 6 ms; pre-computing per-document text embeddings would duplicate the OpenSearch BM25 path without beating it on this corpus. |
| Exact vs approximate search? | Exact (`IndexFlatIP`) | 193 vectors means the 512-d dot product is free. The code structure lets us swap to HNSW without changing any caller. |
| Normalize once or per query? | Both. Offline normalizes corpus vectors before `index.add`; online normalizes each query vector. | Dot product on unit vectors = cosine. |
| Where does CLIP live? | Singleton in `_ClipState`, lazy-loaded at first call | Fast uvicorn boot; import-time side effects stay minimal so the health check works before CLIP is ready. |
| How to return self-similar? | `FAISS.reconstruct(row)` + drop self-hit in top-K | Avoids a second CLIP image forward pass when the user clicks "similar to this record". |
| Where is the model config? | `backend/app/config.py` via pydantic-settings | `.env` / env-var override — swap ViT-B/32 → ViT-L/14 without code changes. |

---

## Performance on the HPC dev machine (NVIDIA H100)

| Path | Warm latency | What dominates |
|---|---|---|
| Text → image | **~9 ms** | CLIP text encode (~6 ms) |
| Image → image | **~180 ms** | PIL decode + `preprocess` (resize + center-crop + normalize), then CLIP image encode |
| Similar-by-id | **~3 ms** | FAISS search (the embedding is already materialized; no neural network runs) |

Cold-start (first request after boot): add ~1.5 s for CLIP weight load.
That's a one-time cost per backend process.

---

## Frontend entry points

- `frontend/components/VisualApp.tsx` — the `/visual` page with the three
  mode chips + prompt/upload/similar panels. URL-syncs `?q=` and `?id=` so
  a shared link reproduces the same view.
- `frontend/lib/multimodal.ts` — thin `fetch` wrappers:
  - `mmText(q, k)` → `GET /multimodal_search?q=…&k=…`
  - `mmImage(file, k)` → `POST` with `multipart/form-data` `image=<file>`
  - `mmSimilar(id, k)` → `POST` with `identifier=<oai:...>`
- The search page (`SearchApp.tsx`) links to `/visual?id=<hit.id>` from a
  "similar images" button on every `ResultCard`, which activates the
  Similar mode on mount.

---

## Extension hooks

- **More thumbnails / a bigger model** — change `--model` and
  `--pretrained` on `embed_clip.py`, or override via `CLIP_MODEL` /
  `CLIP_PRETRAINED` env vars. Re-embed the whole corpus and restart the
  backend; everything else just works.
- **Approximate search at scale** — replace `faiss.IndexFlatIP(dim)` with
  `faiss.IndexHNSWFlat(dim, M=32)` in `build_index` and rebuild. Query
  code is unchanged.
- **Hybrid lexical + visual ranking** — wire `/search` and
  `/multimodal_search` in parallel, linearly combine
  `score_bm25_normalized + α * score_clip` in the frontend. No backend
  change.
- **Store embeddings in OpenSearch `dense_vector`** — removes the pickle
  and unifies the storage. Cost: lose FAISS's SIMD speed at small N; gain
  per-query filtering (e.g. "visual search restricted to 1920s").

---

## File map

| File | What it does |
|---|---|
| `data_pipeline/embed_clip.py` | Offline: CLI + `build_index()` — loads CLIP, pairs records with thumbnails, embeds in batches, writes FAISS + pickle. |
| `backend/app/multimodal.py` | Online: `_ClipState` singleton + `/multimodal_search` GET & POST handlers + `_fetch_hits_by_ids` helper. |
| `backend/app/config.py` | Runtime config (CLIP model name, FAISS paths, env-var overrides). |
| `backend/tests/test_multimodal.py` | Unit tests for `_fetch_hits_by_ids` ordering / mget branches (no CLIP/FAISS required). |
| `frontend/lib/multimodal.ts` | HTTP client with three mode-specific functions. |
| `frontend/components/VisualApp.tsx` | `/visual` page — mode switcher + three panels + 4-col result grid. |
| `frontend/components/ResultCard.tsx` | Search result card; "similar images" button links to `/visual?id=<id>`. |
| `data/faiss/clip.index` | FAISS flat index (gitignored, regenerable). |
| `data/faiss/clip.meta.pkl` | Row-aligned `[(identifier, thumbnail_path), …]` (gitignored). |

---

## Rebuilding the index end-to-end

```bash
# 1. harvest metadata (10–15 s for 200 records, longer for more)
python -m data_pipeline.harvest --limit 200 --only-with-thumbnail

# 2. download thumbnails (concurrent, ~15 s for 200)
python -m data_pipeline.download_thumbnails \
    --input data/raw/openbeelden-YYYYMMDD.jsonl

# 3. (optional but recommended) spaCy NER enrichment
python -m data_pipeline.enrich_ner \
    --input  data/raw/openbeelden-YYYYMMDD.jsonl \
    --output data/enriched/openbeelden-YYYYMMDD.jsonl

# 4. CLIP embed + FAISS index (2 s for 200 thumbnails on H100)
python -m data_pipeline.embed_clip \
    --records data/enriched/openbeelden-YYYYMMDD.jsonl

# 5. restart the backend so _ClipState reloads from disk
pkill -f 'backend.app.main'
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 &
```
