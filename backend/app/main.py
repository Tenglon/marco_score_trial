"""
BeeldenSearch FastAPI backend.

Routes are mounted per-feature in ``backend.app.routes``. This module wires
configuration, CORS, and the OpenSearch client.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from opensearchpy import OpenSearch

from backend.app.config import get_settings
from backend.app.multimodal import router as multimodal_router
from backend.app.search import router as search_router

log = logging.getLogger("beeldensearch")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Open a shared OpenSearch client for the app's lifetime."""
    settings = get_settings()
    app.state.os_client = OpenSearch(hosts=[settings.opensearch_url], timeout=30)
    try:
        info = app.state.os_client.info()
        log.info("connected to OpenSearch %s", info.get("version", {}).get("number"))
    except Exception as e:
        log.warning("OpenSearch not reachable at startup: %s", e)
    yield
    app.state.os_client.close()


app = FastAPI(
    title="BeeldenSearch API",
    version="0.1.0",
    description="Search + multimodal retrieval over Openbeelden, ASCoR interview demo.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(search_router)
app.include_router(multimodal_router)


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    settings = get_settings()
    os_ok = "unknown"
    try:
        os_ok = "ok" if app.state.os_client.ping() else "unreachable"
    except Exception as e:
        os_ok = f"error: {e}"
    return {
        "status": "ok",
        "opensearch": os_ok,
        "opensearch_url": settings.opensearch_url,
        "opensearch_index": settings.opensearch_index,
        "llm_model": settings.llm_model,
    }


@app.get("/", tags=["meta"])
def root() -> dict[str, str]:
    return {
        "service": "beeldensearch",
        "docs": "/docs",
        "health": "/health",
    }
