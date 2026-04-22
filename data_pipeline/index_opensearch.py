"""
Create the OpenSearch index mapping and bulk-load records.

Mapping notes
-------------
- ``title`` / ``description`` / ``abstract`` use the Dutch analyzer for the
  main field, with an ``.en`` subfield using the English analyzer for mixed-
  language queries.
- Facet fields (``creator``, ``subject``, ``publisher``, ``type``, ``license``,
  ``set_spec``, ``language``) are ``keyword``.
- ``year`` is ``integer`` for timeline histograms; ``date`` is ``keyword``.
- ``entities`` is ``nested`` so the entity-network feature can pre-aggregate.

Example
-------
    python -m data_pipeline.index_opensearch \\
        --input data/raw/openbeelden-20260422.jsonl
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from opensearchpy import OpenSearch
from opensearchpy.helpers import streaming_bulk
from tqdm import tqdm

log = logging.getLogger("index_opensearch")

INDEX_MAPPING: dict[str, Any] = {
    "settings": {
        "number_of_shards": 1,
        "number_of_replicas": 0,
        "analysis": {
            "analyzer": {
                "dutch_analyzer": {"type": "dutch"},
                "english_analyzer": {"type": "english"},
            }
        },
    },
    "mappings": {
        "properties": {
            "identifier": {"type": "keyword"},
            "archive_id": {"type": "keyword"},
            "datestamp": {"type": "date"},
            "set_spec": {"type": "keyword"},
            "title": {
                "type": "text",
                "analyzer": "dutch_analyzer",
                "fields": {
                    "en": {"type": "text", "analyzer": "english_analyzer"},
                    "raw": {"type": "keyword", "ignore_above": 512},
                },
            },
            "alternative": {"type": "text", "analyzer": "dutch_analyzer"},
            "creator": {"type": "keyword"},
            "subject": {"type": "keyword"},
            "description": {
                "type": "text",
                "analyzer": "dutch_analyzer",
                "fields": {"en": {"type": "text", "analyzer": "english_analyzer"}},
            },
            "abstract": {
                "type": "text",
                "analyzer": "dutch_analyzer",
                "fields": {"en": {"type": "text", "analyzer": "english_analyzer"}},
            },
            "publisher": {"type": "keyword"},
            "date": {"type": "keyword"},
            "year": {"type": "integer"},
            "type": {"type": "keyword"},
            "extent": {"type": "keyword"},
            "language": {"type": "keyword"},
            "spatial": {"type": "keyword"},
            "temporal": {"type": "keyword"},
            "license": {"type": "keyword"},
            "source_url": {"type": "keyword"},
            "attribution_name": {"type": "keyword"},
            "attribution_url": {"type": "keyword"},
            "thumbnail_url": {"type": "keyword"},
            "media": {
                "type": "nested",
                "properties": {
                    "format": {"type": "keyword"},
                    "url": {"type": "keyword"},
                },
            },
            "entities": {
                "type": "nested",
                "properties": {
                    "text": {"type": "keyword"},
                    "label": {"type": "keyword"},
                },
            },
        },
    },
}


def _iter_actions(records: Iterator[dict[str, Any]], index: str) -> Iterator[dict[str, Any]]:
    for rec in records:
        yield {
            "_op_type": "index",
            "_index": index,
            "_id": rec["identifier"],
            "_source": rec,
        }


def _load_records(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def create_index(client: OpenSearch, index: str, *, recreate: bool) -> None:
    if client.indices.exists(index=index):
        if recreate:
            log.info("dropping existing index %s", index)
            client.indices.delete(index=index)
        else:
            log.info("index %s already exists — skipping create", index)
            return
    log.info("creating index %s", index)
    client.indices.create(index=index, body=INDEX_MAPPING)


def index_records(
    client: OpenSearch, records: list[dict[str, Any]], index: str, *, chunk: int
) -> tuple[int, int]:
    success, errors = 0, 0
    pbar = tqdm(total=len(records), desc="indexing", unit="doc")
    for ok, _ in streaming_bulk(
        client,
        _iter_actions(iter(records), index),
        chunk_size=chunk,
        raise_on_error=False,
        raise_on_exception=False,
    ):
        if ok:
            success += 1
        else:
            errors += 1
        pbar.update(1)
    pbar.close()
    return success, errors


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="JSONL harvest output")
    parser.add_argument(
        "--opensearch-url", default="http://localhost:9200", help="OpenSearch base URL"
    )
    parser.add_argument("--index", default="openbeelden")
    parser.add_argument("--chunk", type=int, default=200)
    parser.add_argument("--recreate", action="store_true", help="drop and recreate the index")
    parser.add_argument("--log-level", default="INFO")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    logging.basicConfig(
        level=args.log_level,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )
    records = _load_records(args.input)
    log.info("loaded %d records from %s", len(records), args.input)

    client = OpenSearch(hosts=[args.opensearch_url], timeout=60)
    try:
        client.ping()
    except Exception as e:
        log.error("cannot reach OpenSearch at %s: %s", args.opensearch_url, e)
        return 2

    create_index(client, args.index, recreate=args.recreate)
    success, errors = index_records(client, records, args.index, chunk=args.chunk)
    log.info("indexed success=%d errors=%d", success, errors)

    client.indices.refresh(index=args.index)
    count = client.count(index=args.index)["count"]
    log.info("index %s now has %d documents", args.index, count)
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
