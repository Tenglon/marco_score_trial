"""Smoke test for the FastAPI app without requiring a running OpenSearch."""

from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_root_returns_service_metadata() -> None:
    with TestClient(app) as client:
        r = client.get("/")
    assert r.status_code == 200
    assert r.json()["service"] == "beeldensearch"


def test_health_reports_opensearch_status() -> None:
    with TestClient(app) as client:
        r = client.get("/health")
    body = r.json()
    assert r.status_code == 200
    assert body["status"] == "ok"
    # OpenSearch may or may not be reachable in this env — just check the field exists
    assert "opensearch" in body
    assert "llm_model" in body
