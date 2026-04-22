"""Unit tests for multimodal endpoint helpers (no CLIP / FAISS required)."""

from __future__ import annotations

from backend.app.multimodal import _fetch_hits_by_ids


class _FakeOpenSearch:
    def __init__(self, docs_by_id: dict[str, dict[str, object]]) -> None:
        self.docs = docs_by_id

    def mget(self, index: str, body: dict[str, object]) -> dict[str, object]:
        ids = body.get("ids", [])
        assert isinstance(ids, list)
        out: list[dict[str, object]] = []
        for i in ids:
            src = self.docs.get(str(i))
            out.append(
                {
                    "_id": i,
                    "found": src is not None,
                    "_source": src or {},
                }
            )
        return {"docs": out}


def test_fetch_hits_preserves_order_and_scores() -> None:
    src_a = {"title": "A", "year": 1920, "subject": [], "creator": []}
    src_b = {"title": "B", "year": 1921, "subject": [], "creator": []}
    src_c = {"title": "C", "year": 1922, "subject": [], "creator": []}
    client = _FakeOpenSearch({"a": src_a, "b": src_b, "c": src_c})

    # Ask in order b, c, a with scores
    ids = ["b", "c", "a"]
    scores = {"a": 0.3, "b": 0.8, "c": 0.7}
    hits = _fetch_hits_by_ids(client, "idx", ids, scores)
    assert [h.id for h in hits] == ["b", "c", "a"]
    assert [h.title for h in hits] == ["B", "C", "A"]
    assert hits[0].score == 0.8
    assert hits[1].score == 0.7
    assert hits[2].score == 0.3


def test_fetch_hits_skips_missing() -> None:
    client = _FakeOpenSearch({"x": {"title": "X"}})
    hits = _fetch_hits_by_ids(client, "idx", ["missing", "x"], {"x": 0.5})
    assert len(hits) == 1
    assert hits[0].id == "x"


def test_fetch_hits_empty() -> None:
    client = _FakeOpenSearch({})
    assert _fetch_hits_by_ids(client, "idx", [], {}) == []
