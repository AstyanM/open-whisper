"""Tests for REST API routes."""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from src.main import app
from src.storage.repository import SessionRepository
from datetime import datetime, timezone


@pytest_asyncio.fixture
async def client(db):
    """Async HTTP client for testing routes."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_health_returns_structured_response(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("healthy", "degraded", "unhealthy")
    assert "checks" in data
    assert "database" in data["checks"]
    assert data["service"] == "voice-to-speech-local-backend"


@pytest.mark.asyncio
async def test_health_database_check_passes(client):
    resp = await client.get("/health")
    data = resp.json()
    assert data["checks"]["database"]["status"] == "ok"


@pytest.mark.asyncio
async def test_list_sessions_empty(client):
    resp = await client.get("/api/sessions")
    assert resp.status_code == 200
    data = resp.json()
    assert data["sessions"] == []


@pytest.mark.asyncio
async def test_get_session_not_found(client):
    resp = await client.get("/api/sessions/999")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_session_not_found(client):
    resp = await client.delete("/api/sessions/999")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_config(client):
    # Load config so the endpoint can serve it
    import src.main
    from src.config import load_config

    src.main.config = load_config()

    resp = await client.get("/api/config")
    assert resp.status_code == 200
    data = resp.json()
    assert "language" in data
    assert "audio" in data
    assert "models" in data


@pytest.mark.asyncio
async def test_get_config_returns_503_when_not_loaded(client):
    import src.main

    src.main.config = None

    resp = await client.get("/api/config")
    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_list_sessions_with_data(client, db):
    repo = SessionRepository(db)
    now = datetime.now(timezone.utc)
    await repo.create_session("transcription", "fr", now)
    await repo.create_session("dictation", "en", now)

    resp = await client.get("/api/sessions")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["sessions"]) == 2


@pytest.mark.asyncio
async def test_get_session_with_segments(client, db):
    repo = SessionRepository(db)
    now = datetime.now(timezone.utc)
    session_id = await repo.create_session("transcription", "fr", now)
    await repo.add_segment(session_id, "hello world", 0, 1000)

    resp = await client.get(f"/api/sessions/{session_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["session"]["mode"] == "transcription"
    assert len(data["segments"]) == 1
    assert data["full_text"] == "hello world"


@pytest.mark.asyncio
async def test_delete_session_success(client, db):
    repo = SessionRepository(db)
    now = datetime.now(timezone.utc)
    session_id = await repo.create_session("transcription", "fr", now)

    resp = await client.delete(f"/api/sessions/{session_id}")
    assert resp.status_code == 200
    assert resp.json()["deleted"] is True

    resp = await client.get(f"/api/sessions/{session_id}")
    assert resp.status_code == 404
