"""Tests for ChromaDB vector store."""

import pytest
import pytest_asyncio

from src.search.vector_store import (
    init_vector_store,
    close_vector_store,
    index_session,
    delete_session_embedding,
    search_sessions,
    get_collection,
)


@pytest_asyncio.fixture
async def vector_store(tmp_path):
    """Initialize a temporary ChromaDB store."""
    db_path = str(tmp_path / "test.db")
    await init_vector_store(db_path)
    yield
    await close_vector_store()


@pytest.mark.asyncio
async def test_index_and_search(vector_store):
    await index_session(
        session_id=1,
        full_text="We discussed the quarterly sales report and revenue targets",
        language="en",
        mode="transcription",
        duration_s=120.0,
        started_at="2026-01-15T10:00:00Z",
    )
    await index_session(
        session_id=2,
        full_text="Recipe for chocolate cake with vanilla frosting",
        language="en",
        mode="transcription",
        duration_s=60.0,
        started_at="2026-01-16T10:00:00Z",
    )

    results = await search_sessions("business meeting about sales")
    assert len(results) == 2
    assert results[0] == 1  # More relevant


@pytest.mark.asyncio
async def test_delete_embedding(vector_store):
    await index_session(
        session_id=1,
        full_text="Test session content for deletion",
        language="fr",
        mode="dictation",
        duration_s=30.0,
        started_at="2026-01-15T10:00:00Z",
    )

    collection = get_collection()
    assert collection.count() == 1

    await delete_session_embedding(1)
    assert collection.count() == 0


@pytest.mark.asyncio
async def test_empty_text_not_indexed(vector_store):
    await index_session(
        session_id=1,
        full_text="",
        language="fr",
        mode="transcription",
        duration_s=0.0,
        started_at="2026-01-15T10:00:00Z",
    )
    await index_session(
        session_id=2,
        full_text="   ",
        language="fr",
        mode="transcription",
        duration_s=0.0,
        started_at="2026-01-15T10:00:00Z",
    )

    collection = get_collection()
    assert collection.count() == 0


@pytest.mark.asyncio
async def test_search_with_language_filter(vector_store):
    await index_session(
        session_id=1,
        full_text="Bonjour, nous avons discute du projet",
        language="fr",
        mode="transcription",
        duration_s=60.0,
        started_at="2026-01-15T10:00:00Z",
    )
    await index_session(
        session_id=2,
        full_text="Hello, we discussed the project",
        language="en",
        mode="transcription",
        duration_s=60.0,
        started_at="2026-01-15T10:00:00Z",
    )

    results = await search_sessions(
        "project discussion",
        where={"language": "en"},
    )
    assert len(results) == 1
    assert results[0] == 2


@pytest.mark.asyncio
async def test_search_empty_collection(vector_store):
    results = await search_sessions("anything")
    assert results == []


@pytest.mark.asyncio
async def test_upsert_updates_existing(vector_store):
    await index_session(
        session_id=1,
        full_text="Original text about cats",
        language="en",
        mode="transcription",
        duration_s=30.0,
        started_at="2026-01-15T10:00:00Z",
    )
    await index_session(
        session_id=1,
        full_text="Updated text about dogs and puppies",
        language="en",
        mode="transcription",
        duration_s=30.0,
        started_at="2026-01-15T10:00:00Z",
    )

    collection = get_collection()
    assert collection.count() == 1

    results = await search_sessions("dogs puppies")
    assert results[0] == 1
