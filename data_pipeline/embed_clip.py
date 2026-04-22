"""
Compute CLIP image embeddings for downloaded thumbnails + build a FAISS index.

Persists two files under ``data/faiss/``:
- ``clip.index`` — FAISS inner-product index over unit-normalized embeddings
- ``clip.meta.pkl`` — list of ``(identifier, thumbnail_path)`` aligned to index rows

Example
-------
    python -m data_pipeline.embed_clip \\
        --records data/enriched/openbeelden-20260422.jsonl \\
        --thumbnails data/thumbnails
"""

from __future__ import annotations

import argparse
import json
import logging
import pickle
import sys
from pathlib import Path
from typing import Any

from tqdm import tqdm

log = logging.getLogger("embed_clip")


def _id_tail(identifier: str) -> str:
    return identifier.rsplit(":", 1)[-1]


def _resolve_thumbnail_path(tail: str, thumb_dir: Path) -> Path | None:
    for ext in (".jpg", ".jpeg", ".png", ".webp"):
        p = thumb_dir / f"{tail}{ext}"
        if p.exists() and p.stat().st_size > 0:
            return p
    return None


def _load_records(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def build_index(
    records: list[dict[str, Any]],
    thumb_dir: Path,
    index_path: Path,
    meta_path: Path,
    *,
    model_name: str,
    pretrained: str,
    batch_size: int,
) -> tuple[int, int]:
    import faiss  # type: ignore[import-not-found]
    import numpy as np
    import open_clip  # type: ignore[import-not-found]
    import torch
    from PIL import Image

    device = "cuda" if torch.cuda.is_available() else "cpu"
    log.info("loading CLIP model %s (%s) on %s", model_name, pretrained, device)
    model, _, preprocess = open_clip.create_model_and_transforms(
        model_name, pretrained=pretrained, device=device
    )
    model.eval()

    pairs: list[tuple[str, Path]] = []
    for rec in records:
        tail = _id_tail(rec["identifier"])
        p = _resolve_thumbnail_path(tail, thumb_dir)
        if p is not None:
            pairs.append((rec["identifier"], p))

    if not pairs:
        log.warning("no thumbnails found to embed")
        return 0, 0

    embeddings: list[np.ndarray] = []
    with torch.no_grad():
        for i in tqdm(range(0, len(pairs), batch_size), desc="embed", unit="batch"):
            batch = pairs[i : i + batch_size]
            imgs = []
            for _, path in batch:
                try:
                    imgs.append(preprocess(Image.open(path).convert("RGB")))
                except Exception as e:
                    log.debug("skip unreadable thumbnail %s: %s", path, e)
                    imgs.append(None)
            kept_idx = [j for j, img in enumerate(imgs) if img is not None]
            kept_tensors = [imgs[j] for j in kept_idx]
            if not kept_tensors:
                continue
            stacked = torch.stack(kept_tensors).to(device)
            feats = model.encode_image(stacked)
            feats = feats / feats.norm(dim=-1, keepdim=True)
            feats_np = feats.cpu().numpy().astype("float32")
            # align pairs: drop failed entries from the batch
            pairs[i : i + batch_size] = [batch[j] for j in kept_idx]
            embeddings.append(feats_np)

    matrix = np.concatenate(embeddings, axis=0) if embeddings else np.zeros((0, 0))
    log.info("built embedding matrix: %s", matrix.shape)

    dim = matrix.shape[1]
    index = faiss.IndexFlatIP(dim)
    index.add(matrix)

    index_path.parent.mkdir(parents=True, exist_ok=True)
    faiss.write_index(index, str(index_path))
    with meta_path.open("wb") as f:
        pickle.dump(pairs[: matrix.shape[0]], f)

    log.info("saved %d vectors (dim=%d) → %s", matrix.shape[0], dim, index_path)
    return matrix.shape[0], dim


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--records", type=Path, required=True, help="JSONL path")
    parser.add_argument("--thumbnails", type=Path, default=Path("data/thumbnails"))
    parser.add_argument("--index-path", type=Path, default=Path("data/faiss/clip.index"))
    parser.add_argument("--meta-path", type=Path, default=Path("data/faiss/clip.meta.pkl"))
    parser.add_argument("--model", default="ViT-B-32")
    parser.add_argument("--pretrained", default="laion2b_s34b_b79k")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--log-level", default="INFO")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    logging.basicConfig(
        level=args.log_level,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )
    records = _load_records(args.records)
    log.info("embedding %d records from %s", len(records), args.records)
    count, dim = build_index(
        records,
        args.thumbnails,
        args.index_path,
        args.meta_path,
        model_name=args.model,
        pretrained=args.pretrained,
        batch_size=args.batch_size,
    )
    log.info("done — %d vectors, dim=%d", count, dim)
    return 0


if __name__ == "__main__":
    sys.exit(main())
