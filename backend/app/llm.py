"""
/llm/* — query expansion and grounded summarization via litellm.

Design principles
-----------------
- **Open-source-first.** Defaults to a local Ollama model
  (``ollama/qwen2.5:7b-instruct``); switchable to any OpenAI-compatible API
  via env (LLM_MODEL / LLM_BASE_URL / LLM_API_KEY).
- **Research-honest.** Summarization is strictly grounded in the retrieved
  documents. The prompt requires every factual claim to be tagged with a
  numbered citation ``[n]`` referring back to a returned hit; the UI labels
  the panel as experimental and shows citations inline with the result list.
- **Clearly bounded output.** Query expansion returns up to 3 alternative
  phrasings as JSON; summarize returns 3 bullets as JSON. No free-form chat.
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from backend.app.config import get_settings
from backend.app.search import Hit, _parse_hits

log = logging.getLogger("beeldensearch.llm")
router = APIRouter(tags=["llm"])


class ExpandRequest(BaseModel):
    q: str = Field(..., min_length=1, max_length=200)
    n: int = Field(3, ge=1, le=5)


class ExpandResponse(BaseModel):
    original: str
    alternatives: list[str]
    model: str
    took_ms: int


class Citation(BaseModel):
    n: int
    id: str
    title: str
    year: int | None


class SummarizeRequest(BaseModel):
    q: str = Field(..., min_length=1, max_length=400)
    k: int = Field(10, ge=3, le=20)


class SummarizeResponse(BaseModel):
    query: str
    bullets: list[str]
    citations: list[Citation]
    model: str
    took_ms: int


def _call_llm(prompt: str, *, max_tokens: int = 500, temperature: float = 0.2) -> str:
    """Thin wrapper around litellm.completion — returns the raw text reply."""
    import litellm

    settings = get_settings()
    try:
        resp = litellm.completion(
            model=settings.llm_model,
            messages=[{"role": "user", "content": prompt}],
            api_base=settings.llm_base_url if settings.llm_provider == "ollama" else None,
            api_key=settings.llm_api_key,
            max_tokens=max_tokens,
            temperature=temperature,
            timeout=settings.llm_timeout_s,
        )
    except Exception as e:
        log.exception("LLM call failed")
        raise HTTPException(status_code=502, detail=f"LLM backend error: {e}") from e
    choices = getattr(resp, "choices", None) or resp["choices"]
    msg = choices[0].message if hasattr(choices[0], "message") else choices[0]["message"]
    content = msg.content if hasattr(msg, "content") else msg["content"]
    return (content or "").strip()


_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]+?)```", re.MULTILINE)


def _parse_json_block(text: str) -> Any:
    """Permissive JSON parser: accepts fenced blocks or raw JSON anywhere in output."""
    m = _FENCE_RE.search(text)
    candidate = m.group(1).strip() if m else text
    # Fallback: find first { or [ and last } or ]
    if not candidate.lstrip().startswith(("{", "[")):
        start_obj = candidate.find("{")
        start_arr = candidate.find("[")
        starts = [i for i in (start_obj, start_arr) if i >= 0]
        if not starts:
            raise ValueError("no JSON object/array found in model output")
        start = min(starts)
        end = max(candidate.rfind("}"), candidate.rfind("]"))
        candidate = candidate[start : end + 1]
    return json.loads(candidate)


EXPAND_PROMPT = """You help a researcher broaden a metadata search over a Dutch \
audiovisual heritage archive. Given the user's query, propose {n} alternative \
phrasings that might surface related records. Mix English and Dutch where it \
helps recall, include synonyms and hyponyms, and stay under 8 words per \
alternative. Return strict JSON of the form:

{{"alternatives": ["...", "...", "..."]}}

User query: {q}
"""


@router.post("/llm/expand_query", response_model=ExpandResponse)
def expand_query(req: ExpandRequest) -> ExpandResponse:
    settings = get_settings()
    prompt = EXPAND_PROMPT.format(n=req.n, q=req.q)
    t0 = time.perf_counter()
    raw = _call_llm(prompt, max_tokens=250, temperature=0.4)
    took = int((time.perf_counter() - t0) * 1000)
    try:
        parsed = _parse_json_block(raw)
        alts = parsed.get("alternatives") if isinstance(parsed, dict) else parsed
        assert isinstance(alts, list)
        cleaned = [str(a).strip() for a in alts if str(a).strip()][: req.n]
    except Exception as e:
        log.warning("failed to parse expand_query output: %r", raw[:200])
        raise HTTPException(status_code=502, detail="LLM returned unparseable output") from e
    return ExpandResponse(
        original=req.q, alternatives=cleaned, model=settings.llm_model, took_ms=took
    )


SUMMARIZE_PROMPT = """You are summarizing search results for an academic \
researcher querying a Dutch audiovisual archive. Write exactly 3 short \
bullets (≤ 25 words each) that describe patterns visible in these records. \
Every factual claim MUST cite one or more numbered records like "[1]", \
"[2][3]". DO NOT invent facts not supported by the records. If the evidence \
is thin for a claim, say so and still cite. Reply in English. Return strict \
JSON of the form:

{{"bullets": ["...", "...", "..."]}}

User query: {q}

Records:
{records}
"""


def _fetch_top_hits(client: Any, index: str, q: str, k: int) -> list[Hit]:
    from backend.app.search import _build_query

    query = _build_query(
        q,
        year_from=None,
        year_to=None,
        creator=None,
        subject=None,
        license_=None,
        type_=None,
        set_spec=None,
    )
    body: dict[str, Any] = {
        "size": k,
        "query": query,
        "sort": ["_score"],
    }
    resp = client.search(index=index, body=body)
    return _parse_hits(resp["hits"]["hits"])


def _format_records(hits: list[Hit]) -> str:
    lines: list[str] = []
    for i, h in enumerate(hits, 1):
        year = h.year if h.year is not None else "?"
        desc = (h.description or h.abstract or "").strip().replace("\n", " ")
        if len(desc) > 240:
            desc = desc[:237] + "…"
        lines.append(f"[{i}] {h.title} ({year}) — {desc}")
    return "\n".join(lines)


def _parse_citations(text: str) -> list[int]:
    return sorted({int(n) for n in re.findall(r"\[(\d+)\]", text)})


@router.post("/llm/summarize", response_model=SummarizeResponse)
def summarize(request: Request, req: SummarizeRequest) -> SummarizeResponse:
    settings = get_settings()
    hits = _fetch_top_hits(request.app.state.os_client, settings.opensearch_index, req.q, req.k)
    if not hits:
        raise HTTPException(status_code=404, detail=f"no records for query {req.q!r}")

    prompt = SUMMARIZE_PROMPT.format(q=req.q, records=_format_records(hits))
    t0 = time.perf_counter()
    raw = _call_llm(prompt, max_tokens=500, temperature=0.15)
    took = int((time.perf_counter() - t0) * 1000)

    try:
        parsed = _parse_json_block(raw)
        bullets = parsed.get("bullets") if isinstance(parsed, dict) else parsed
        assert isinstance(bullets, list)
        bullets = [str(b).strip() for b in bullets if str(b).strip()][:3]
    except Exception as e:
        log.warning("failed to parse summarize output: %r", raw[:200])
        raise HTTPException(status_code=502, detail="LLM returned unparseable output") from e

    cited: set[int] = set()
    for b in bullets:
        cited.update(_parse_citations(b))

    citations: list[Citation] = []
    for n in sorted(cited):
        if 1 <= n <= len(hits):
            h = hits[n - 1]
            citations.append(Citation(n=n, id=h.id, title=h.title, year=h.year))

    return SummarizeResponse(
        query=req.q,
        bullets=bullets,
        citations=citations,
        model=settings.llm_model,
        took_ms=took,
    )
