"""Unit tests for the entity graph aggregator (no OpenSearch required)."""

from __future__ import annotations

from collections import Counter
from itertools import combinations


def _build_graph(
    docs: list[list[dict[str, str]]],
    *,
    top_n: int,
    min_weight: int,
    keep_labels: set[str] | None = None,
) -> tuple[list[tuple[str, str, int]], list[tuple[str, str, int]]]:
    """Pure-Python replica of the aggregation in backend.app.entities.

    Returns (nodes, edges) where each tuple is (text, label, count/weight).
    Kept here as a reference so the test is independent from FastAPI plumbing.
    """
    label_of: dict[str, str] = {}
    doc_count: Counter[str] = Counter()
    doc_ents: list[set[str]] = []
    for doc in docs:
        kept: set[str] = set()
        for ent in doc:
            text = ent["text"].strip()
            label = ent["label"]
            if keep_labels and label not in keep_labels:
                continue
            if not text:
                continue
            kept.add(text)
            label_of.setdefault(text, label)
        if kept:
            doc_ents.append(kept)
            for t in kept:
                doc_count[t] += 1
    top = [t for t, _ in doc_count.most_common(top_n)]
    top_set = set(top)
    nodes = [(t, label_of[t], doc_count[t]) for t in top]
    pair_count: Counter[tuple[str, str]] = Counter()
    for ents in doc_ents:
        for a, b in combinations(sorted(ents & top_set), 2):
            pair_count[(a, b)] += 1
    edges = [(a, b, w) for (a, b), w in pair_count.items() if w >= min_weight]
    edges.sort(key=lambda e: e[2], reverse=True)
    return nodes, edges


def test_top_entities_ranked_by_document_frequency() -> None:
    docs = [
        [{"text": "Amsterdam", "label": "GPE"}, {"text": "Nederland", "label": "GPE"}],
        [{"text": "Amsterdam", "label": "GPE"}, {"text": "Willy Mullens", "label": "PERSON"}],
        [{"text": "Rotterdam", "label": "GPE"}],
    ]
    nodes, _ = _build_graph(docs, top_n=10, min_weight=1)
    counts = {t: c for t, _l, c in nodes}
    assert counts["Amsterdam"] == 2
    assert counts["Nederland"] == 1
    assert counts["Rotterdam"] == 1
    assert nodes[0][0] == "Amsterdam"


def test_entities_deduped_per_document() -> None:
    docs = [
        [
            {"text": "Amsterdam", "label": "GPE"},
            {"text": "Amsterdam", "label": "GPE"},
            {"text": "Amsterdam", "label": "GPE"},
        ],
    ]
    nodes, _ = _build_graph(docs, top_n=10, min_weight=1)
    assert nodes == [("Amsterdam", "GPE", 1)]


def test_min_weight_filters_out_rare_pairs() -> None:
    docs = [
        [{"text": "A", "label": "GPE"}, {"text": "B", "label": "GPE"}],
        [{"text": "A", "label": "GPE"}, {"text": "B", "label": "GPE"}],
        [{"text": "A", "label": "GPE"}, {"text": "C", "label": "GPE"}],
    ]
    _, edges = _build_graph(docs, top_n=10, min_weight=2)
    assert ("A", "B", 2) in edges
    assert not any(pair[:2] == ("A", "C") for pair in edges)


def test_label_filter_restricts_node_set() -> None:
    docs = [
        [{"text": "Amsterdam", "label": "GPE"}, {"text": "Willy", "label": "PERSON"}],
    ]
    nodes, _ = _build_graph(docs, top_n=10, min_weight=1, keep_labels={"PERSON"})
    assert [n[0] for n in nodes] == ["Willy"]


def test_empty_corpus_returns_empty_graph() -> None:
    nodes, edges = _build_graph([], top_n=10, min_weight=1)
    assert nodes == []
    assert edges == []
