"""Unit tests for the search query builder + response parsers (no OpenSearch)."""

from __future__ import annotations

from backend.app.search import (
    _build_aggs,
    _build_query,
    _parse_facets,
    _parse_hits,
    _parse_timeline,
)


def test_build_query_match_all_on_empty_q() -> None:
    q = _build_query(
        "",
        year_from=None,
        year_to=None,
        creator=None,
        subject=None,
        license_=None,
        type_=None,
        set_spec=None,
    )
    assert q["bool"]["must"] == [{"match_all": {}}]
    assert q["bool"]["filter"] == []


def test_build_query_query_string_with_filters() -> None:
    q = _build_query(
        "amsterdam AND havens",
        year_from=1920,
        year_to=1930,
        creator=None,
        subject=["havens"],
        license_=None,
        type_=["Moving Image"],
        set_spec=None,
    )
    must = q["bool"]["must"][0]["query_string"]
    assert must["query"] == "amsterdam AND havens"
    assert must["default_operator"] == "AND"
    filters = q["bool"]["filter"]
    # year range + subject terms + type terms
    assert {"range": {"year": {"gte": 1920, "lte": 1930}}} in filters
    assert {"terms": {"subject": ["havens"]}} in filters
    assert {"terms": {"type": ["Moving Image"]}} in filters


def test_build_aggs_includes_timeline_and_facets() -> None:
    aggs = _build_aggs(5)
    assert aggs["timeline"]["histogram"]["field"] == "year"
    assert aggs["timeline"]["histogram"]["interval"] == 5
    for name in ("creator", "subject", "publisher", "type", "license"):
        assert name in aggs


def test_parse_hits_handles_missing_optional_fields() -> None:
    raw = [
        {
            "_id": "oai:openimages.eu:42",
            "_score": 1.5,
            "_source": {
                "title": "Test",
                "description": "desc",
                "subject": ["x"],
                "year": 2000,
                "thumbnail_url": "https://e.g/a.png",
            },
            "highlight": {"title": ["<mark>Test</mark>"]},
        }
    ]
    hits = _parse_hits(raw)
    assert len(hits) == 1
    h = hits[0]
    assert h.id == "oai:openimages.eu:42"
    assert h.title == "Test"
    assert h.score == 1.5
    assert h.year == 2000
    assert h.abstract == ""
    assert h.creator == []
    assert h.highlights["title"] == ["<mark>Test</mark>"]


def test_parse_facets_and_timeline() -> None:
    aggs = {
        "subject": {"buckets": [{"key": "havens", "doc_count": 4}]},
        "timeline": {"buckets": [{"key": 1920.0, "doc_count": 10}]},
        "creator": {"buckets": []},
        "publisher": {"buckets": []},
        "type": {"buckets": []},
        "license": {"buckets": []},
        "set_spec": {"buckets": []},
        "language": {"buckets": []},
    }
    facets = _parse_facets(aggs)
    assert facets["subject"][0].key == "havens"
    assert facets["subject"][0].doc_count == 4
    timeline = _parse_timeline(aggs)
    assert timeline[0].year == 1920
    assert timeline[0].doc_count == 10
