"""Tests for SQLite storage layer."""

import pytest
import pytest_asyncio
from datetime import datetime, timezone

from src.storage.database import init_db, close_db
from src.storage.repository import SessionRepository


@pytest_asyncio.fixture
async def db():
    """Create an in-memory database for testing."""
    conn = await init_db(":memory:")
    yield conn
    await close_db(conn)


@pytest_asyncio.fixture
async def repo(db):
    """Create a repository with the test database."""
    return SessionRepository(db)


@pytest.mark.asyncio
async def test_create_and_get_session(repo):
    now = datetime.now(timezone.utc)
    session_id = await repo.create_session("transcription", "fr", now)
    assert session_id is not None
    assert session_id > 0

    session = await repo.get_session(session_id)
    assert session is not None
    assert session.mode == "transcription"
    assert session.language == "fr"


@pytest.mark.asyncio
async def test_end_session(repo):
    now = datetime.now(timezone.utc)
    session_id = await repo.create_session("transcription", "en", now)
    await repo.end_session(session_id, now, 10.5)

    session = await repo.get_session(session_id)
    assert session.duration_s == 10.5
    assert session.ended_at is not None


@pytest.mark.asyncio
async def test_list_sessions(repo):
    now = datetime.now(timezone.utc)
    await repo.create_session("transcription", "fr", now)
    await repo.create_session("dictation", "en", now)

    sessions = await repo.list_sessions()
    assert len(sessions) == 2


@pytest.mark.asyncio
async def test_delete_session_cascades_segments(repo):
    now = datetime.now(timezone.utc)
    session_id = await repo.create_session("transcription", "fr", now)
    await repo.add_segment(session_id, "hello world", 0, 1000)

    deleted = await repo.delete_session(session_id)
    assert deleted is True

    session = await repo.get_session(session_id)
    assert session is None
    segments = await repo.get_segments(session_id)
    assert len(segments) == 0


@pytest.mark.asyncio
async def test_delete_nonexistent_session(repo):
    deleted = await repo.delete_session(999)
    assert deleted is False


@pytest.mark.asyncio
async def test_add_and_get_segments(repo):
    now = datetime.now(timezone.utc)
    session_id = await repo.create_session("transcription", "fr", now)

    seg1_id = await repo.add_segment(session_id, "hello", 0, 500)
    seg2_id = await repo.add_segment(session_id, "world", 500, 1000)

    assert seg1_id > 0
    assert seg2_id > seg1_id

    segments = await repo.get_segments(session_id)
    assert len(segments) == 2
    assert segments[0].text == "hello"
    assert segments[1].text == "world"
    assert segments[0].start_ms == 0
    assert segments[1].start_ms == 500


@pytest.mark.asyncio
async def test_get_session_full_text(repo):
    now = datetime.now(timezone.utc)
    session_id = await repo.create_session("transcription", "fr", now)
    await repo.add_segment(session_id, "hello", 0, 500)
    await repo.add_segment(session_id, "world", 500, 1000)

    text = await repo.get_session_full_text(session_id)
    assert text == "hello world"


@pytest.mark.asyncio
async def test_get_session_full_text_empty(repo):
    now = datetime.now(timezone.utc)
    session_id = await repo.create_session("transcription", "fr", now)

    text = await repo.get_session_full_text(session_id)
    assert text == ""


@pytest.mark.asyncio
async def test_list_sessions_pagination(repo):
    now = datetime.now(timezone.utc)
    for i in range(5):
        await repo.create_session("transcription", "fr", now)

    page1 = await repo.list_sessions(limit=2, offset=0)
    assert len(page1) == 2

    page2 = await repo.list_sessions(limit=2, offset=2)
    assert len(page2) == 2

    page3 = await repo.list_sessions(limit=2, offset=4)
    assert len(page3) == 1


# ── filter_sessions tests ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_filter_sessions_by_language(repo):
    now = datetime.now(timezone.utc)
    await repo.create_session("transcription", "fr", now)
    await repo.create_session("transcription", "en", now)
    await repo.create_session("dictation", "fr", now)

    results = await repo.filter_sessions(language="fr")
    assert len(results) == 2
    assert all(s.language == "fr" for s in results)


@pytest.mark.asyncio
async def test_filter_sessions_by_mode(repo):
    now = datetime.now(timezone.utc)
    await repo.create_session("transcription", "fr", now)
    await repo.create_session("dictation", "en", now)

    results = await repo.filter_sessions(mode="dictation")
    assert len(results) == 1
    assert results[0].mode == "dictation"


@pytest.mark.asyncio
async def test_filter_sessions_by_duration_range(repo):
    now = datetime.now(timezone.utc)
    s1 = await repo.create_session("transcription", "fr", now)
    await repo.end_session(s1, now, 5.0)
    s2 = await repo.create_session("transcription", "fr", now)
    await repo.end_session(s2, now, 15.0)
    s3 = await repo.create_session("transcription", "fr", now)
    await repo.end_session(s3, now, 60.0)

    results = await repo.filter_sessions(duration_min=10.0, duration_max=30.0)
    assert len(results) == 1
    assert results[0].duration_s == 15.0


@pytest.mark.asyncio
async def test_filter_sessions_by_ids(repo):
    now = datetime.now(timezone.utc)
    id1 = await repo.create_session("transcription", "fr", now)
    await repo.create_session("transcription", "en", now)
    id3 = await repo.create_session("dictation", "fr", now)

    results = await repo.filter_sessions(session_ids=[id3, id1])
    assert len(results) == 2
    # Should preserve order from session_ids
    assert results[0].id == id3
    assert results[1].id == id1


@pytest.mark.asyncio
async def test_filter_sessions_empty_ids(repo):
    now = datetime.now(timezone.utc)
    await repo.create_session("transcription", "fr", now)

    results = await repo.filter_sessions(session_ids=[])
    assert len(results) == 0


@pytest.mark.asyncio
async def test_filter_sessions_no_filters(repo):
    now = datetime.now(timezone.utc)
    await repo.create_session("transcription", "fr", now)
    await repo.create_session("dictation", "en", now)

    results = await repo.filter_sessions()
    assert len(results) == 2
