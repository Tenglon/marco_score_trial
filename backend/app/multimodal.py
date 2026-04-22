"""
/multimodal_search — cross-modal retrieval via CLIP + FAISS.

Two modes in one endpoint:
- GET with ``q`` → encode the text with CLIP's text tower, retrieve top-K images.
- POST with ``image`` (multipart/form-data) → encode the image with CLIP's
  image tower, retrieve top-K nearest images (``more-like-this``).
- POST with ``id`` (body form) → look up an already-indexed id and retrieve
  near neighbours (used by the "similar" button on result cards).

Hits are returned in the same shape as /search to keep the frontend simple.
"""

from __future__ import annotations

import io
import logging
import pickle
import threading
from pathlib import Path
from typing import Any, cast

import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel

from backend.app.config import get_settings
from backend.app.search import Hit, _parse_hits

log = logging.getLogger("beeldensearch.multimodal")
router = APIRouter(tags=["multimodal"])


class MultimodalResponse(BaseModel):
    query: str
    mode: str
    k: int
    took_ms: int
    hits: list[Hit]


class _ClipState:
    """Lazily-loaded CLIP model + FAISS index, singleton per process."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._loaded = False
        self._model: Any = None
        self._tokenizer: Any = None
        self._preprocess: Any = None
        self._device: str = "cpu"
        self._index: Any = None
        self._ids: list[str] = []
        self._paths: list[Path] = []
        self._id_to_row: dict[str, int] = {}

    def ensure_loaded(self) -> None:
        if self._loaded:
            return
        with self._lock:
            if self._loaded:
                return
            settings = get_settings()
            import faiss
            import open_clip
            import torch

            self._device = "cuda" if torch.cuda.is_available() else "cpu"
            log.info(
                "loading CLIP %s (%s) on %s",
                settings.clip_model,
                settings.clip_pretrained,
                self._device,
            )
            self._model, _, self._preprocess = open_clip.create_model_and_transforms(
                settings.clip_model,
                pretrained=settings.clip_pretrained,
                device=self._device,
            )
            self._model.eval()
            self._tokenizer = open_clip.get_tokenizer(settings.clip_model)

            index_path = Path(settings.faiss_index_path)
            meta_path = Path(settings.faiss_meta_path)
            if not index_path.exists() or not meta_path.exists():
                log.warning(
                    "FAISS files missing: %s / %s — /multimodal_search will 503",
                    index_path,
                    meta_path,
                )
            else:
                self._index = faiss.read_index(str(index_path))
                with meta_path.open("rb") as f:
                    pairs: list[tuple[str, Path]] = pickle.load(f)
                self._ids = [p[0] for p in pairs]
                self._paths = [p[1] for p in pairs]
                self._id_to_row = {i: n for n, i in enumerate(self._ids)}
                log.info("FAISS ready: %d vectors, dim=%d", self._index.ntotal, self._index.d)
            self._loaded = True

    def has_index(self) -> bool:
        return self._loaded and self._index is not None

    def encode_text(self, text: str) -> np.ndarray:
        import torch

        toks = self._tokenizer([text]).to(self._device)
        with torch.no_grad():
            feats = self._model.encode_text(toks)
            feats = feats / feats.norm(dim=-1, keepdim=True)
        return feats.cpu().numpy().astype("float32")

    def encode_image(self, image_bytes: bytes) -> np.ndarray:
        import torch
        from PIL import Image

        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        tensor = self._preprocess(img).unsqueeze(0).to(self._device)
        with torch.no_grad():
            feats = self._model.encode_image(tensor)
            feats = feats / feats.norm(dim=-1, keepdim=True)
        return feats.cpu().numpy().astype("float32")

    def search(self, query_vec: np.ndarray, k: int) -> list[tuple[str, float]]:
        assert self._index is not None
        scores, idxs = self._index.search(query_vec, k)
        out: list[tuple[str, float]] = []
        for score, row in zip(scores[0].tolist(), idxs[0].tolist(), strict=False):
            if row < 0:
                continue
            out.append((self._ids[row], float(score)))
        return out

    def row_vector(self, row: int) -> np.ndarray:
        assert self._index is not None
        vec = self._index.reconstruct(row)
        return np.asarray(vec, dtype="float32").reshape(1, -1)

    def id_to_row(self, identifier: str) -> int | None:
        return self._id_to_row.get(identifier)


_STATE = _ClipState()


def _fetch_hits_by_ids(
    os_client: Any, index: str, ids: list[str], scores: dict[str, float]
) -> list[Hit]:
    """Use OpenSearch mget to batch-fetch metadata for the returned ids."""
    if not ids:
        return []
    resp = os_client.mget(index=index, body={"ids": ids})
    raw: list[dict[str, Any]] = []
    for doc in resp.get("docs", []):
        if not doc.get("found"):
            continue
        raw.append(
            {
                "_id": doc["_id"],
                "_score": scores.get(doc["_id"], 0.0),
                "_source": doc["_source"],
                "highlight": {},
            }
        )
    hits = _parse_hits(raw)
    order = {i: n for n, i in enumerate(ids)}
    hits.sort(key=lambda h: order.get(h.id, 999))
    return hits


@router.get("/multimodal_search", response_model=MultimodalResponse)
def multimodal_search_text(
    request: Request,
    q: str = Query(..., min_length=1, description="natural-language prompt"),
    k: int = Query(24, ge=1, le=60),
) -> MultimodalResponse:
    import time

    _STATE.ensure_loaded()
    if not _STATE.has_index():
        raise HTTPException(status_code=503, detail="FAISS index unavailable")
    t0 = time.perf_counter()
    vec = _STATE.encode_text(q)
    pairs = _STATE.search(vec, k)
    settings = get_settings()
    hits = _fetch_hits_by_ids(
        request.app.state.os_client,
        settings.opensearch_index,
        [i for i, _ in pairs],
        dict(pairs),
    )
    took = int((time.perf_counter() - t0) * 1000)
    return MultimodalResponse(query=q, mode="text", k=k, took_ms=took, hits=hits)


@router.post("/multimodal_search", response_model=MultimodalResponse)
async def multimodal_search_upload(
    request: Request,
    image: UploadFile | None = File(None),
    identifier: str | None = Form(None),
    k: int = Form(24),
) -> MultimodalResponse:
    import time

    _STATE.ensure_loaded()
    if not _STATE.has_index():
        raise HTTPException(status_code=503, detail="FAISS index unavailable")
    k = max(1, min(k, 60))

    t0 = time.perf_counter()
    if identifier:
        row = _STATE.id_to_row(identifier)
        if row is None:
            raise HTTPException(status_code=404, detail=f"id {identifier!r} not indexed")
        vec = _STATE.row_vector(row)
        mode = "similar"
        label = identifier
    elif image is not None:
        data = await image.read()
        if len(data) == 0:
            raise HTTPException(status_code=400, detail="empty image upload")
        vec = _STATE.encode_image(data)
        mode = "image"
        label = cast(str, image.filename) or "uploaded"
    else:
        raise HTTPException(
            status_code=400, detail="provide either an image upload or an identifier"
        )

    pairs = _STATE.search(vec, k + 1 if mode == "similar" else k)
    # Drop self-hit when doing similar-to
    if mode == "similar":
        pairs = [p for p in pairs if p[0] != identifier][:k]

    settings = get_settings()
    hits = _fetch_hits_by_ids(
        request.app.state.os_client,
        settings.opensearch_index,
        [i for i, _ in pairs],
        dict(pairs),
    )
    took = int((time.perf_counter() - t0) * 1000)
    return MultimodalResponse(query=label, mode=mode, k=k, took_ms=took, hits=hits)
