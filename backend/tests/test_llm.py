"""Unit tests for LLM helpers — parser + prompt formatter + citation extractor."""

from __future__ import annotations

from backend.app.llm import (
    _format_records,
    _parse_citations,
    _parse_json_block,
)
from backend.app.search import Hit


def test_parse_json_block_accepts_raw_json() -> None:
    out = _parse_json_block('{"alternatives": ["a", "b"]}')
    assert out == {"alternatives": ["a", "b"]}


def test_parse_json_block_accepts_fenced_json() -> None:
    text = """Sure!
```json
{"bullets": ["one", "two", "three"]}
```
"""
    out = _parse_json_block(text)
    assert out == {"bullets": ["one", "two", "three"]}


def test_parse_json_block_accepts_prefix_noise() -> None:
    text = 'Of course. Here is the result: {"alternatives": ["x"]}'
    out = _parse_json_block(text)
    assert out == {"alternatives": ["x"]}


def test_parse_citations_extracts_and_sorts() -> None:
    text = "Lorem [3] ipsum [1][1][7] dolor [12]."
    assert _parse_citations(text) == [1, 3, 7, 12]


def test_parse_citations_handles_no_citations() -> None:
    assert _parse_citations("no references here") == []


def _mk_hit(i: int, title: str, desc: str, year: int | None = 1925) -> Hit:
    return Hit(
        id=f"id:{i}",
        title=title,
        description=desc,
        abstract="",
        date="",
        year=year,
        creator=[],
        subject=[],
        publisher=[],
        spatial=[],
        type="Moving Image",
        license="",
        thumbnail_url=None,
        source_url="",
        archive_id="",
        score=1.0,
        highlights={},
    )


def test_format_records_numbers_and_truncates() -> None:
    long_desc = "x" * 500
    hits = [
        _mk_hit(1, "Alpha", "short desc"),
        _mk_hit(2, "Beta", long_desc, year=None),
    ]
    text = _format_records(hits)
    lines = text.split("\n")
    assert lines[0].startswith("[1] Alpha (1925) — short desc")
    assert lines[1].startswith("[2] Beta (?) — ")
    # second line should be truncated with ellipsis
    assert lines[1].endswith("…")
    assert len(lines[1]) < 400
