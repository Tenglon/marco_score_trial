"""
/entity_graph — top entities + co-occurrence network over the current query.

For a given search query, returns:
- ``nodes``: ``[{text, label, count}]`` — the top-N entities by document
  frequency in the matching set.
- ``edges``: ``[{source, target, weight, label_pair}]`` — pairs of top entities
  that co-occur in at least ``min_weight`` documents.

Implementation: we cap at ``corpus_cap`` matching documents (default 500) and
compute co-occurrence in Python. For demo-scale (hundreds to low thousands of
records) this is instantaneous; for production corpora this would move into
OpenSearch composite aggregations.
"""

from __future__ import annotations

from collections import Counter
from itertools import combinations
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from backend.app.config import get_settings
from backend.app.search import _build_query

router = APIRouter(tags=["entities"])


class GraphNode(BaseModel):
    text: str
    label: str
    count: int


class GraphEdge(BaseModel):
    source: str
    target: str
    weight: int
    label_pair: str


class EntityGraph(BaseModel):
    query: str
    docs_scanned: int
    total_matches: int
    node_count: int
    edge_count: int
    nodes: list[GraphNode]
    edges: list[GraphEdge]


@router.get("/entity_graph", response_model=EntityGraph)
def entity_graph(
    request: Request,
    q: str = Query("", description="query string; empty = whole corpus"),
    top_n: int = Query(30, ge=5, le=80, alias="topN"),
    min_weight: int = Query(2, ge=1, le=10, alias="minWeight"),
    corpus_cap: int = Query(500, ge=50, le=2000, alias="corpusCap"),
    year_from: int | None = Query(None, alias="yearFrom"),
    year_to: int | None = Query(None, alias="yearTo"),
    labels: list[str] | None = Query(None, description="filter entity labels"),
) -> EntityGraph:
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
        "size": corpus_cap,
        "_source": ["identifier", "entities"],
        "query": query,
        "track_total_hits": True,
    }

    try:
        resp = client.search(index=settings.opensearch_index, body=body)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"query failed: {e}") from e

    hits = resp["hits"]["hits"]
    total_matches = int(resp["hits"]["total"]["value"])

    keep_labels = set(labels) if labels else None
    label_of: dict[str, str] = {}
    doc_count = Counter()
    doc_ents: list[set[str]] = []

    for h in hits:
        src = h.get("_source", {})
        raw_entities = src.get("entities") or []
        kept: set[str] = set()
        for ent in raw_entities:
            text = (ent.get("text") or "").strip()
            label = ent.get("label", "")
            if not text:
                continue
            if keep_labels and label not in keep_labels:
                continue
            kept.add(text)
            # First-seen label wins — stable across docs
            label_of.setdefault(text, label)
        if kept:
            doc_ents.append(kept)
            for t in kept:
                doc_count[t] += 1

    top = [t for t, _ in doc_count.most_common(top_n)]
    top_set = set(top)
    nodes = [GraphNode(text=t, label=label_of.get(t, "MISC"), count=doc_count[t]) for t in top]

    pair_count: Counter[tuple[str, str]] = Counter()
    for ents in doc_ents:
        present = sorted(ents & top_set)
        for a, b in combinations(present, 2):
            pair_count[(a, b)] += 1

    edges: list[GraphEdge] = []
    for (a, b), w in pair_count.items():
        if w < min_weight:
            continue
        edges.append(
            GraphEdge(
                source=a,
                target=b,
                weight=w,
                label_pair=f"{label_of.get(a, 'MISC')}-{label_of.get(b, 'MISC')}",
            )
        )
    edges.sort(key=lambda e: e.weight, reverse=True)

    return EntityGraph(
        query=q,
        docs_scanned=len(hits),
        total_matches=total_matches,
        node_count=len(nodes),
        edge_count=len(edges),
        nodes=nodes,
        edges=edges,
    )
