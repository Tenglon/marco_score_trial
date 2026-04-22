"""
/search and /timeline_agg endpoints.

Uses OpenSearch ``query_string`` so users can do boolean, wildcards, phrases,
and parentheses in the same input box — matching the CLARIAH Single Search UX.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from backend.app.config import get_settings

router = APIRouter(tags=["search"])

FACET_FIELDS: dict[str, str] = {
    "creator": "creator",
    "subject": "subject",
    "publisher": "publisher",
    "type": "type",
    "license": "license",
    "set_spec": "set_spec",
    "language": "language",
}

SEARCHABLE_FIELDS: list[str] = [
    "title^3",
    "title.en^2",
    "alternative^2",
    "description",
    "description.en",
    "abstract",
    "abstract.en",
    "subject^2",
    "creator",
    "publisher",
    "spatial^1.5",
]


class Hit(BaseModel):
    id: str
    title: str
    description: str
    abstract: str
    date: str
    year: int | None
    creator: list[str]
    subject: list[str]
    publisher: list[str]
    spatial: list[str]
    type: str
    license: str
    thumbnail_url: str | None
    source_url: str
    archive_id: str
    score: float
    highlights: dict[str, list[str]]


class Bucket(BaseModel):
    key: str
    doc_count: int


class TimelineBucket(BaseModel):
    year: int
    doc_count: int


class SearchResponse(BaseModel):
    query: str
    total: int
    took_ms: int
    hits: list[Hit]
    facets: dict[str, list[Bucket]]
    timeline: list[TimelineBucket]


def _build_query(
    q: str,
    *,
    year_from: int | None,
    year_to: int | None,
    creator: list[str] | None,
    subject: list[str] | None,
    license_: list[str] | None,
    type_: list[str] | None,
    set_spec: list[str] | None,
) -> dict[str, Any]:
    must: list[dict[str, Any]] = []
    if q.strip():
        must.append(
            {
                "query_string": {
                    "query": q,
                    "fields": SEARCHABLE_FIELDS,
                    "default_operator": "AND",
                    "lenient": True,
                }
            }
        )
    else:
        must.append({"match_all": {}})

    filters: list[dict[str, Any]] = []
    if year_from is not None or year_to is not None:
        rng: dict[str, int] = {}
        if year_from is not None:
            rng["gte"] = year_from
        if year_to is not None:
            rng["lte"] = year_to
        filters.append({"range": {"year": rng}})

    for field, values in (
        ("creator", creator),
        ("subject", subject),
        ("license", license_),
        ("type", type_),
        ("set_spec", set_spec),
    ):
        if values:
            filters.append({"terms": {field: values}})

    return {"bool": {"must": must, "filter": filters}}


def _build_aggs(timeline_interval: int) -> dict[str, Any]:
    aggs: dict[str, Any] = {
        name: {"terms": {"field": field, "size": 20}} for name, field in FACET_FIELDS.items()
    }
    aggs["timeline"] = {
        "histogram": {
            "field": "year",
            "interval": timeline_interval,
            "min_doc_count": 0,
        }
    }
    return aggs


def _parse_hits(raw_hits: list[dict[str, Any]]) -> list[Hit]:
    out: list[Hit] = []
    for h in raw_hits:
        src = h["_source"]
        out.append(
            Hit(
                id=h["_id"],
                title=src.get("title", ""),
                description=src.get("description", ""),
                abstract=src.get("abstract", ""),
                date=src.get("date", ""),
                year=src.get("year"),
                creator=src.get("creator", []),
                subject=src.get("subject", []),
                publisher=src.get("publisher", []),
                spatial=src.get("spatial", []),
                type=src.get("type", ""),
                license=src.get("license", ""),
                thumbnail_url=src.get("thumbnail_url"),
                source_url=src.get("source_url", ""),
                archive_id=src.get("archive_id", ""),
                score=float(h.get("_score") or 0.0),
                highlights=h.get("highlight", {}),
            )
        )
    return out


def _parse_facets(aggs: dict[str, Any]) -> dict[str, list[Bucket]]:
    out: dict[str, list[Bucket]] = {}
    for name in FACET_FIELDS:
        buckets = aggs.get(name, {}).get("buckets", [])
        out[name] = [Bucket(key=str(b["key"]), doc_count=b["doc_count"]) for b in buckets]
    return out


def _parse_timeline(aggs: dict[str, Any]) -> list[TimelineBucket]:
    raw = aggs.get("timeline", {}).get("buckets", [])
    return [TimelineBucket(year=int(b["key"]), doc_count=b["doc_count"]) for b in raw]


@router.get("/search", response_model=SearchResponse)
def search(
    request: Request,
    q: str = Query("", description="query string (supports boolean, wildcards, phrases)"),
    size: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    sort: str = Query("relevance", pattern="^(relevance|date_desc|date_asc)$"),
    year_from: int | None = Query(None, alias="yearFrom"),
    year_to: int | None = Query(None, alias="yearTo"),
    creator: list[str] | None = Query(None),
    subject: list[str] | None = Query(None),
    license_: list[str] | None = Query(None, alias="license"),
    type_: list[str] | None = Query(None, alias="type"),
    set_spec: list[str] | None = Query(None, alias="set"),
    timeline_interval: int = Query(1, alias="timelineInterval", ge=1, le=50),
) -> SearchResponse:
    client = request.app.state.os_client
    settings = get_settings()

    query = _build_query(
        q,
        year_from=year_from,
        year_to=year_to,
        creator=creator,
        subject=subject,
        license_=license_,
        type_=type_,
        set_spec=set_spec,
    )

    sort_clause: list[dict[str, Any] | str] = ["_score"]
    if sort == "date_desc":
        sort_clause = [{"year": {"order": "desc", "missing": "_last"}}, "_score"]
    elif sort == "date_asc":
        sort_clause = [{"year": {"order": "asc", "missing": "_last"}}, "_score"]

    body: dict[str, Any] = {
        "from": offset,
        "size": size,
        "query": query,
        "aggs": _build_aggs(timeline_interval),
        "sort": sort_clause,
        "highlight": {
            "pre_tags": ["<mark>"],
            "post_tags": ["</mark>"],
            "fields": {
                "title": {"number_of_fragments": 0},
                "description": {"fragment_size": 160, "number_of_fragments": 2},
                "abstract": {"fragment_size": 160, "number_of_fragments": 2},
            },
        },
        "track_total_hits": True,
    }

    try:
        resp = client.search(index=settings.opensearch_index, body=body)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"search failed: {e}") from e

    return SearchResponse(
        query=q,
        total=int(resp["hits"]["total"]["value"]),
        took_ms=int(resp.get("took", 0)),
        hits=_parse_hits(resp["hits"]["hits"]),
        facets=_parse_facets(resp.get("aggregations", {})),
        timeline=_parse_timeline(resp.get("aggregations", {})),
    )


class TimelineResponse(BaseModel):
    query: str
    interval: int
    buckets: list[TimelineBucket]
    total: int


@router.get("/timeline_agg", response_model=TimelineResponse)
def timeline_agg(
    request: Request,
    q: str = Query(""),
    interval: int = Query(1, ge=1, le=50),
    year_from: int | None = Query(None, alias="yearFrom"),
    year_to: int | None = Query(None, alias="yearTo"),
) -> TimelineResponse:
    """Standalone timeline endpoint — useful for the Compare feature."""
    client = request.app.state.os_client
    settings = get_settings()

    query = _build_query(
        q,
        year_from=year_from,
        year_to=year_to,
        creator=None,
        subject=None,
        license_=None,
        type_=None,
        set_spec=None,
    )
    body: dict[str, Any] = {
        "size": 0,
        "query": query,
        "aggs": {
            "timeline": {
                "histogram": {
                    "field": "year",
                    "interval": interval,
                    "min_doc_count": 0,
                }
            }
        },
        "track_total_hits": True,
    }
    resp = client.search(index=settings.opensearch_index, body=body)
    return TimelineResponse(
        query=q,
        interval=interval,
        buckets=_parse_timeline(resp.get("aggregations", {})),
        total=int(resp["hits"]["total"]["value"]),
    )
