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
    assert data["service"] == "openwhisper-backend"


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
    # Full config is now returned (not just a subset)
    assert "language" in data
    assert "audio" in data
    assert "models" in data
    assert "shortcuts" in data
    assert "overlay" in data
    assert "storage" in data
    assert "backend" in data


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


# ── PUT /api/config tests ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_config_language(client, tmp_path):
    """PUT /api/config updates language and categorises it as applied."""
    import src.main
    from src.config import AppConfig

    src.main.config = AppConfig.model_validate({})

    # Write a temp config.yaml for the endpoint to persist to
    config_file = tmp_path / "config.yaml"
    config_file.write_text("language: fr\n", encoding="utf-8")

    from unittest.mock import patch

    with patch("src.api.routes.find_config_path", return_value=config_file):
        resp = await client.put("/api/config", json={"language": "en"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "language" in data["applied"]
    assert src.main.config.language == "en"


@pytest.mark.asyncio
async def test_update_config_invalid_delay(client):
    """PUT /api/config rejects out-of-range delay_ms with 422."""
    import src.main
    from src.config import AppConfig

    src.main.config = AppConfig.model_validate({})

    resp = await client.put(
        "/api/config",
        json={"models": {"transcription": {"delay_ms": 10}}},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_update_config_restart_required(client, tmp_path):
    """PUT /api/config flags audio.device as restart_required."""
    import src.main
    from src.config import AppConfig

    src.main.config = AppConfig.model_validate({})

    config_file = tmp_path / "config.yaml"
    config_file.write_text("language: fr\n", encoding="utf-8")

    from unittest.mock import patch

    with patch("src.api.routes.find_config_path", return_value=config_file):
        resp = await client.put(
            "/api/config", json={"audio": {"device": "my-mic"}}
        )

    assert resp.status_code == 200
    data = resp.json()
    assert "audio.device" in data["restart_required"]


@pytest.mark.asyncio
async def test_update_config_returns_503_when_not_loaded(client):
    """PUT /api/config returns 503 when config hasn't been loaded."""
    import src.main

    src.main.config = None

    resp = await client.put("/api/config", json={"language": "en"})
    assert resp.status_code == 503


# ── GET /api/audio/devices ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_audio_devices(client):
    """GET /api/audio/devices returns a list of devices."""
    from unittest.mock import patch

    mock_devices = [
        {"index": 0, "name": "Test Mic", "channels": 1, "sample_rate": 16000.0}
    ]
    with patch("src.api.routes.AudioCapture.list_devices", return_value=mock_devices):
        resp = await client.get("/api/audio/devices")

    assert resp.status_code == 200
    data = resp.json()
    assert "devices" in data
    assert len(data["devices"]) == 1
    assert data["devices"][0]["name"] == "Test Mic"


# ── GET /api/sessions/search tests ────────────────────────────────


@pytest.mark.asyncio
async def test_search_sessions_no_query(client, db):
    """Search without query returns all sessions (like list)."""
    repo = SessionRepository(db)
    now = datetime.now(timezone.utc)
    await repo.create_session("transcription", "fr", now)
    await repo.create_session("dictation", "en", now)

    resp = await client.get("/api/sessions/search")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["sessions"]) == 2


@pytest.mark.asyncio
async def test_search_sessions_filter_by_language(client, db):
    """Search with language filter returns only matching sessions."""
    repo = SessionRepository(db)
    now = datetime.now(timezone.utc)
    await repo.create_session("transcription", "fr", now)
    await repo.create_session("transcription", "en", now)

    resp = await client.get("/api/sessions/search?language=fr")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["sessions"]) == 1
    assert data["sessions"][0]["language"] == "fr"


@pytest.mark.asyncio
async def test_search_sessions_filter_by_mode(client, db):
    """Search with mode filter returns only matching sessions."""
    repo = SessionRepository(db)
    now = datetime.now(timezone.utc)
    await repo.create_session("transcription", "fr", now)
    await repo.create_session("dictation", "en", now)

    resp = await client.get("/api/sessions/search?mode=dictation")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["sessions"]) == 1
    assert data["sessions"][0]["mode"] == "dictation"


@pytest.mark.asyncio
async def test_search_sessions_filter_by_duration(client, db):
    """Search with duration filter returns only matching sessions."""
    repo = SessionRepository(db)
    now = datetime.now(timezone.utc)
    s1 = await repo.create_session("transcription", "fr", now)
    await repo.end_session(s1, now, 5.0)
    s2 = await repo.create_session("transcription", "fr", now)
    await repo.end_session(s2, now, 120.0)

    resp = await client.get("/api/sessions/search?duration_min=60")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["sessions"]) == 1
    assert data["sessions"][0]["duration_s"] == 120.0
