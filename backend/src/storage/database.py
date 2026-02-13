"""SQLite database initialization and migrations."""

import logging
from pathlib import Path

import aiosqlite

logger = logging.getLogger(__name__)

_db: aiosqlite.Connection | None = None

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    mode        TEXT NOT NULL,
    language    TEXT NOT NULL DEFAULT 'fr',
    started_at  DATETIME NOT NULL,
    ended_at    DATETIME,
    duration_s  REAL,
    summary     TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS segments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    start_ms    INTEGER NOT NULL,
    end_ms      INTEGER,
    confidence  REAL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
"""


async def init_db(db_path: str) -> aiosqlite.Connection:
    """Initialize the SQLite database and create tables if needed."""
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    db = await aiosqlite.connect(str(path))
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    await db.executescript(_SCHEMA_SQL)
    await db.commit()

    logger.info(f"Database initialized at {path.resolve()}")
    return db


async def close_db(db: aiosqlite.Connection) -> None:
    """Close the database connection."""
    await db.close()
    logger.info("Database connection closed")


def get_db() -> aiosqlite.Connection:
    """Get the current database connection."""
    if _db is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _db


def set_db(db: aiosqlite.Connection) -> None:
    """Set the global database reference (called from lifespan)."""
    global _db
    _db = db
