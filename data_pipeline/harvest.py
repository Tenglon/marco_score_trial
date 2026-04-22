"""
Harvest Openbeelden records via OAI-PMH.

Writes one JSON object per line to ``data/raw/openbeelden-YYYYMMDD.jsonl``.

Example
-------
    python -m data_pipeline.harvest --limit 1500
    python -m data_pipeline.harvest --set beeldengeluid --limit 500
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from lxml import etree
from tenacity import (
    RetryCallState,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)
from tqdm import tqdm

log = logging.getLogger("harvest")

OAI_ENDPOINT = "https://www.openbeelden.nl/feeds/oai/"
THUMBNAIL_BASE = "https://www.openbeelden.nl"

NS = {
    "oai": "http://www.openarchives.org/OAI/2.0/",
    "oai_oi": "http://www.openbeelden.nl/feeds/oai/",
    "oi": "http://www.openbeelden.nl/oai/",
    "dc": "http://purl.org/dc/elements/1.1/",
    "dcterms": "http://purl.org/dc/terms",
}


@dataclass
class OaiRecord:
    identifier: str
    datestamp: str
    set_spec: str | None
    title: str
    alternative: list[str] = field(default_factory=list)
    creator: list[str] = field(default_factory=list)
    subject: list[str] = field(default_factory=list)
    description: str = ""
    abstract: str = ""
    publisher: list[str] = field(default_factory=list)
    date: str = ""
    year: int | None = None
    type_: str = ""
    extent: str = ""
    language: list[str] = field(default_factory=list)
    spatial: list[str] = field(default_factory=list)
    temporal: list[str] = field(default_factory=list)
    license: str = ""
    source_url: str = ""
    attribution_name: str = ""
    attribution_url: str = ""
    archive_id: str = ""
    media: list[dict[str, str]] = field(default_factory=list)
    thumbnail_url: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "identifier": self.identifier,
            "datestamp": self.datestamp,
            "set_spec": self.set_spec,
            "title": self.title,
            "alternative": self.alternative,
            "creator": self.creator,
            "subject": self.subject,
            "description": self.description,
            "abstract": self.abstract,
            "publisher": self.publisher,
            "date": self.date,
            "year": self.year,
            "type": self.type_,
            "extent": self.extent,
            "language": self.language,
            "spatial": self.spatial,
            "temporal": self.temporal,
            "license": self.license,
            "source_url": self.source_url,
            "attribution_name": self.attribution_name,
            "attribution_url": self.attribution_url,
            "archive_id": self.archive_id,
            "media": self.media,
            "thumbnail_url": self.thumbnail_url,
        }


class OaiError(Exception):
    """OAI-PMH protocol-level error returned in the response body."""


class TransientHttpError(Exception):
    """Retryable HTTP failure (timeout, 5xx, connection reset)."""


def _log_retry(state: RetryCallState) -> None:
    log.warning(
        "retry %s after %s — sleeping %.1fs",
        state.attempt_number,
        state.outcome.exception() if state.outcome else "?",
        state.next_action.sleep if state.next_action else 0.0,
    )


@retry(
    reraise=True,
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=2, min=2, max=30),
    retry=retry_if_exception_type(TransientHttpError),
    before_sleep=_log_retry,
)
def _fetch(client: httpx.Client, params: dict[str, str]) -> bytes:
    try:
        resp = client.get(OAI_ENDPOINT, params=params, timeout=60.0)
    except (httpx.TimeoutException, httpx.TransportError) as e:
        raise TransientHttpError(str(e)) from e
    if resp.status_code >= 500:
        raise TransientHttpError(f"status={resp.status_code}")
    resp.raise_for_status()
    return resp.content


def _text(elem: etree._Element | None, xpath: str, ns: dict[str, str] = NS) -> str:
    if elem is None:
        return ""
    found = elem.find(xpath, namespaces=ns)
    if found is None or found.text is None:
        return ""
    return found.text.strip()


def _texts(elem: etree._Element | None, xpath: str, ns: dict[str, str] = NS) -> list[str]:
    if elem is None:
        return []
    return [
        node.text.strip()
        for node in elem.findall(xpath, namespaces=ns)
        if node.text and node.text.strip()
    ]


def _extract_year(date_str: str) -> int | None:
    if not date_str:
        return None
    try:
        return int(date_str[:4])
    except (ValueError, IndexError):
        return None


def _resolve_thumbnail(path: str) -> str:
    if path.startswith("http"):
        return path
    if path.startswith("/"):
        return f"{THUMBNAIL_BASE}{path}"
    return f"{THUMBNAIL_BASE}/{path}"


def _parse_record(record_elem: etree._Element) -> OaiRecord | None:
    header = record_elem.find("oai:header", namespaces=NS)
    if header is None:
        return None
    if header.get("status") == "deleted":
        return None

    identifier = _text(header, "oai:identifier")
    if not identifier:
        return None

    datestamp = _text(header, "oai:datestamp")
    set_spec = _text(header, "oai:setSpec") or None

    meta = record_elem.find("oai:metadata/oai_oi:oi", namespaces=NS)
    if meta is None:
        return None

    media: list[dict[str, str]] = []
    thumbnail_url: str | None = None
    for medium in meta.findall("oi:medium", namespaces=NS):
        fmt = medium.get("format", "unknown")
        url = (medium.text or "").strip()
        if not url:
            continue
        if fmt == "thumbnail":
            thumbnail_url = _resolve_thumbnail(url)
            media.append({"format": "thumbnail", "url": thumbnail_url})
        else:
            media.append({"format": fmt, "url": url})

    archive_id = ""
    for ident in meta.findall("oi:identifier", namespaces=NS):
        text = (ident.text or "").strip()
        if text and not text.startswith("http"):
            archive_id = text
            break

    attribution_url_raw = _text(meta, "oi:attributionURL")
    if attribution_url_raw:
        source_url = _resolve_thumbnail(attribution_url_raw)
    else:
        # Fallback: derive canonical URL from oai identifier numeric tail
        tail = identifier.rsplit(":", 1)[-1] if identifier else ""
        source_url = f"{THUMBNAIL_BASE}/media/{tail}" if tail.isdigit() else ""

    date_str = _text(meta, "oi:date")
    return OaiRecord(
        identifier=identifier,
        datestamp=datestamp,
        set_spec=set_spec,
        title=_text(meta, "oi:title"),
        alternative=_texts(meta, "oi:alternative"),
        creator=_texts(meta, "oi:creator"),
        subject=_texts(meta, "oi:subject"),
        description=_text(meta, "oi:description"),
        abstract=_text(meta, "oi:abstract"),
        publisher=_texts(meta, "oi:publisher"),
        date=date_str,
        year=_extract_year(date_str),
        type_=_text(meta, "oi:type"),
        extent=_text(meta, "oi:extent"),
        language=_texts(meta, "oi:language"),
        spatial=_texts(meta, "oi:spatial"),
        temporal=_texts(meta, "oi:temporal"),
        license=_text(meta, "oi:license"),
        source_url=source_url,
        attribution_name=_text(meta, "oi:attributionName"),
        attribution_url=_resolve_thumbnail(attribution_url_raw) if attribution_url_raw else "",
        archive_id=archive_id,
        media=media,
        thumbnail_url=thumbnail_url,
    )


def harvest(
    *,
    limit: int,
    set_spec: str | None,
    from_date: str | None,
    until_date: str | None,
    sleep_s: float,
) -> Iterator[OaiRecord]:
    """Stream records from Openbeelden, yielding one ``OaiRecord`` at a time."""
    params: dict[str, str] = {"verb": "ListRecords", "metadataPrefix": "oai_oi"}
    if set_spec:
        params["set"] = set_spec
    if from_date:
        params["from"] = from_date
    if until_date:
        params["until"] = until_date

    emitted = 0
    with (
        httpx.Client(headers={"User-Agent": "beeldensearch-demo/0.1"}) as client,
        tqdm(total=limit, desc="records", unit="rec") as pbar,
    ):
        while emitted < limit:
            raw = _fetch(client, params)
            root = etree.fromstring(raw)

            oai_errors = root.findall("oai:error", namespaces=NS)
            if oai_errors:
                msgs = "; ".join(f"{e.get('code')}: {(e.text or '').strip()}" for e in oai_errors)
                raise OaiError(msgs)

            records = root.findall("oai:ListRecords/oai:record", namespaces=NS)
            for rec_elem in records:
                if emitted >= limit:
                    break
                rec = _parse_record(rec_elem)
                if rec is None:
                    continue
                yield rec
                emitted += 1
                pbar.update(1)

            token_elem = root.find("oai:ListRecords/oai:resumptionToken", namespaces=NS)
            token = (token_elem.text or "").strip() if token_elem is not None else ""
            if not token:
                log.info("no resumption token — reached end of set at %d records", emitted)
                break

            params = {"verb": "ListRecords", "resumptionToken": token}
            time.sleep(sleep_s)


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=1500, help="max records to harvest")
    parser.add_argument(
        "--set",
        dest="set_spec",
        default=None,
        help="OAI-PMH set (e.g. 'beeldengeluid'). Defaults to all sets.",
    )
    parser.add_argument("--from", dest="from_date", default=None, help="YYYY-MM-DD")
    parser.add_argument("--until", dest="until_date", default=None, help="YYYY-MM-DD")
    parser.add_argument(
        "--sleep",
        type=float,
        default=1.0,
        help="seconds between OAI requests (respect rate limits)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="output .jsonl path; default: data/raw/openbeelden-YYYYMMDD.jsonl",
    )
    parser.add_argument(
        "--only-with-thumbnail",
        action="store_true",
        help="skip records without a thumbnail URL",
    )
    parser.add_argument("--log-level", default="INFO")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    logging.basicConfig(
        level=args.log_level,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )

    if args.output is None:
        today = datetime.now(UTC).strftime("%Y%m%d")
        args.output = Path("data/raw") / f"openbeelden-{today}.jsonl"
    args.output.parent.mkdir(parents=True, exist_ok=True)

    log.info("harvesting up to %d records → %s", args.limit, args.output)

    total_written = 0
    total_skipped = 0
    with args.output.open("w", encoding="utf-8") as f:
        for rec in harvest(
            limit=args.limit,
            set_spec=args.set_spec,
            from_date=args.from_date,
            until_date=args.until_date,
            sleep_s=args.sleep,
        ):
            if args.only_with_thumbnail and not rec.thumbnail_url:
                total_skipped += 1
                continue
            f.write(json.dumps(rec.to_dict(), ensure_ascii=False) + "\n")
            total_written += 1

    log.info("wrote %d records (skipped %d) to %s", total_written, total_skipped, args.output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
