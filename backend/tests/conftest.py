"""Shared test fixtures."""

import pytest_asyncio

from src.storage.database import init_db, close_db, set_db


@pytest_asyncio.fixture
async def db():
    """In-memory database for testing."""
    conn = await init_db(":memory:")
    set_db(conn)
    yield conn
    await close_db(conn)
