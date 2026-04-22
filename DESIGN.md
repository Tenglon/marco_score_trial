# Design notes — BeeldenSearch

A polished copy of the implementation design. For the step-by-step
execution log, see git history; for the feature tour and setup, see
[README.md](README.md).

## Context

Built as a pre-interview demo for the **Research Engineer — Multimodal
Media Analytical Toolbox** position at ASCoR / University of Amsterdam.
Interview panel combines ASCoR computational-communication expertise
(Piotrowski, Araujo, Gritter) with KB research-software engineering
(Bodor). The demo is therefore tuned to show both ends — a production-
shaped stack *and* hooks into computational text analysis.

Three design axes were locked early:

1. **CLARIAH Media Suite Single-Search replica**, because that is the
   concrete tool the role supports. UI and terminology (facets, timeline
   histogram, boolean operators, Compare tool) are lifted from the
   reference.
2. **Multimodal & open-source LLM extensions**, because those are the
   candidate's declared strengths and the role's explicit themes. CLIP
   cross-modal search and an Ollama-backed RAG panel are the
   differentiators.
3. **Dutch-first but international-friendly**. Dutch analyzer + spaCy Dutch
   NER + Dutch archive, English UI labels, NL + EN query expansion.

## Data

Harvested from [Openbeelden](https://www.openbeelden.nl/) via OAI-PMH
(`metadataPrefix=oai_oi`, set `openimages`) with `httpx` + `lxml` +
`tenacity`. 200-record sample shipped by default; harvester caps at
`--limit`, uses resumption tokens, back-off retries on 5xx/timeout, and
respects the archive's "don't dump the whole DB" guidance with a 1s
between-pages sleep.

Field gotchas (documented in `data_pipeline/harvest.py`):
- License is `oi:license`, not `oi:rights`.
- Attribution URL is `oi:attributionURL` (uppercase URL).
- Canonical record URL derives from the numeric tail of
  `oai:openimages.eu:NNNN`.

## Indexes

- **OpenSearch 2.15** single-node, security disabled. Dutch + English
  analyzer pair on `title`, `description`, `abstract` (with `.en` subfields
  to catch mixed-language queries). Keyword fields on every facet and a
  nested `entities` field for the CCS co-occurrence aggregation. `year`
  is `integer` for histogram bucketing.
- **FAISS** inner-product index over L2-normalized CLIP ViT-B/32 image
  embeddings, plus a pickle with `(identifier, thumbnail_path)` pairs
  aligned to index rows. `IndexFlatIP` at 200-doc scale; would move to
  `IndexHNSWFlat` beyond ~50k.

## Backend (`backend/app/*`)

Single FastAPI process with a lifespan-managed OpenSearch client. Per-
feature router modules:

| Module | Endpoint | Contract |
|---|---|---|
| `search.py` | `GET /search` | boolean + wildcard via `query_string`, facets via terms aggs, timeline via year histogram, highlighting with `<mark>`, sort by relevance / year asc / year desc |
| `search.py` | `GET /timeline_agg` | standalone histogram for the Compare page |
| `multimodal.py` | `GET /multimodal_search` | text → CLIP text tower → FAISS top-K → OpenSearch mget |
| `multimodal.py` | `POST /multimodal_search` | image upload **or** identifier → similar neighbours |
| `entities.py` | `GET /entity_graph` | top-N entities + co-occurrence edges over corpus-capped matches |
| `llm.py` | `POST /llm/expand_query` | litellm → JSON list of alternative phrasings |
| `llm.py` | `POST /llm/summarize` | fetch top-k → litellm with strict `[n]` citation prompt → JSON bullets + parsed Citation list |

CLIP model + FAISS index live behind a thread-safe singleton (`_ClipState`
in `multimodal.py`) that loads lazily on first request — backend startup
stays fast; first query absorbs the ~1.5s load cost.

## Frontend (`frontend/app/*`)

Next.js 14 App Router with URL-synced state so every view is
refresh-safe and shareable. Search state, Compare queries, and Visual
similar-to `id` all live in `searchParams`.

Pages:
- `/` — Search. Facets left, timeline + results + LLM panel right.
- `/visual` — Text / Image upload / Similar modes, 4-column thumbnail grid.
- `/entities` — Force-directed co-occurrence graph with
  interactive top-N / min-weight sliders.
- `/compare` — Two queries on one timeline, stacked result columns.

Design system:
- **Type**: Fraunces (display, variable axes) + Instrument Sans (body) +
  JetBrains Mono (metadata, IDs, scores). All via `next/font/google`.
- **Palette**: parchment `#f4ede0`, ink `#1c1814`, brick `#ab4323`, forest
  `#3a564b`, ochre `#edb655`. HSL-based Tailwind tokens with
  `<alpha-value>` so every colour is tunable per use site.
- **Shared motifs**: numbered `№ 001` result ranks, `§` section markers,
  tri-colored underline on the search bar (ink / brick / ochre), noise
  grain on the masthead, tabular numerals on every count.

## LLM contract (research-honest)

Summarization prompt enforces:
1. "Exactly 3 short bullets (≤ 25 words each)".
2. "Every factual claim MUST cite one or more numbered records".
3. "DO NOT invent facts not supported by the records".
4. Return strict JSON.

Response is parsed; cited `[n]`'s are extracted; the UI renders each as
a clickable `sup` chip backed by the actual hit. If the model disobeys
and emits unparseable output, the endpoint 502s instead of faking a
result.

## Verification

End-to-end smoke from a clean clone:

1. `docker compose up -d`; wait for OpenSearch `_cluster/health` green.
2. Run the 5 pipeline commands (harvest → download → enrich → embed →
   index). ~3 minutes wall time on the dev machine for the 200-record
   sample.
3. `curl localhost:8000/search?q=amsterdam&size=3` → ≥ 5 hits, timeline
   buckets populated, facets populated.
4. `curl localhost:8000/entity_graph` → non-empty nodes + edges.
5. `curl -X POST localhost:8000/llm/summarize -d '{"q":"amsterdam"}'` →
   3 bullets with `[n]` citations referencing real hits.
6. Open `localhost:3000` — walk through Search → Visual → Entities →
   Compare → LLM. No console errors.

CI (`.github/workflows/ci.yml`) runs `ruff check`, `ruff format --check`,
and `pytest -q` on every push.

## What's out of scope

Three cuts were made intentionally rather than badly:

- **`mypy --strict` across all code**. open_clip and faiss lack type stubs
  and would need targeted `type: ignore` covers; net value not worth the
  Day-6 time cost. Backend modules are annotated; the config is in
  `pyproject.toml` and ready when stubs land.
- **ASR / OCR layer**. Real CLARIAH Single-Search searches speech
  transcripts and OCR'd on-screen text. Adding that here would require
  running the audio through Whisper per clip (minutes per video) — out of
  scope for a 6-day demo; called out in the README roadmap.
- **Scale beyond ~1,500 records**. Pipeline is tested end-to-end at 200;
  increasing just needs more harvest budget + a longer FAISS build. Cap
  is a demo choice, not a constraint.
