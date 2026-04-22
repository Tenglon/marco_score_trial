"""
Download Openbeelden thumbnails to ``data/thumbnails/``.

Each thumbnail is saved as ``<id_tail>.<ext>`` where ``id_tail`` is the numeric
tail of the ``oai:openimages.eu:NNN`` identifier. Existing files are skipped.

Example
-------
    python -m data_pipeline.download_thumbnails \\
        --input data/raw/openbeelden-20260422.jsonl \\
        --out-dir data/thumbnails
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import logging
import sys
from collections.abc import Iterable
from pathlib import Path
from urllib.parse import urlparse

import httpx
from tqdm import tqdm

log = logging.getLogger("download_thumbnails")


def _id_tail(identifier: str) -> str:
    return identifier.rsplit(":", 1)[-1]


def _ext_from_url(url: str) -> str:
    path = urlparse(url).path.lower()
    for ext in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
        if path.endswith(ext):
            return ext
    return ".jpg"


def _load_records(path: Path) -> list[dict[str, object]]:
    with path.open("r", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def _download_one(
    client: httpx.Client, record: dict[str, object], out_dir: Path
) -> tuple[str, str, bool, str | None]:
    """Returns ``(identifier, path, downloaded, error)``."""
    identifier = str(record["identifier"])
    url = record.get("thumbnail_url")
    if not isinstance(url, str) or not url:
        return identifier, "", False, "no thumbnail_url"

    dest = out_dir / f"{_id_tail(identifier)}{_ext_from_url(url)}"
    if dest.exists() and dest.stat().st_size > 0:
        return identifier, str(dest), False, None

    try:
        resp = client.get(url, timeout=30.0, follow_redirects=True)
        resp.raise_for_status()
        dest.write_bytes(resp.content)
        return identifier, str(dest), True, None
    except Exception as e:
        return identifier, "", False, str(e)


def download_all(
    records: Iterable[dict[str, object]], out_dir: Path, concurrency: int
) -> dict[str, int]:
    out_dir.mkdir(parents=True, exist_ok=True)
    records_list = list(records)
    counts = {"downloaded": 0, "skipped": 0, "failed": 0}

    with (
        httpx.Client(headers={"User-Agent": "beeldensearch-demo/0.1"}) as client,
        concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as ex,
    ):
        futures = [ex.submit(_download_one, client, rec, out_dir) for rec in records_list]
        for fut in tqdm(
            concurrent.futures.as_completed(futures),
            total=len(futures),
            desc="thumbnails",
        ):
            _, _, downloaded, err = fut.result()
            if err:
                counts["failed"] += 1
                log.debug("failed: %s", err)
            elif downloaded:
                counts["downloaded"] += 1
            else:
                counts["skipped"] += 1
    return counts


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input", type=Path, required=True, help="JSONL file produced by harvest.py"
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("data/thumbnails"),
        help="destination directory",
    )
    parser.add_argument("--concurrency", type=int, default=8)
    parser.add_argument("--log-level", default="INFO")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    logging.basicConfig(
        level=args.log_level,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )
    records = _load_records(args.input)
    log.info("downloading %d thumbnails → %s", len(records), args.out_dir)
    counts = download_all(records, args.out_dir, args.concurrency)
    log.info(
        "done: downloaded=%d skipped=%d failed=%d",
        counts["downloaded"],
        counts["skipped"],
        counts["failed"],
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
