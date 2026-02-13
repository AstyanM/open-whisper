"""CRUD operations for sessions and segments."""

import logging
from dataclasses import dataclass
from datetime import datetime

import aiosqlite

from src.exceptions import DatabaseError

logger = logging.getLogger(__name__)


@dataclass
class SessionRow:
    id: int
    mode: str
    language: str
    started_at: str
    ended_at: str | None
    duration_s: float | None
    summary: str | None
    created_at: str


@dataclass
class SegmentRow:
    id: int
    session_id: int
    text: str
    start_ms: int
    end_ms: int | None
    confidence: float | None
    created_at: str


class SessionRepository:
    """CRUD operations for sessions and segments."""

    def __init__(self, db: aiosqlite.Connection):
        self.db = db

    async def create_session(
        self, mode: str, language: str, started_at: datetime
    ) -> int:
        """Create a new session. Returns the session id."""
        try:
            cursor = await self.db.execute(
                "INSERT INTO sessions (mode, language, started_at) VALUES (?, ?, ?)",
                (mode, language, started_at.isoformat()),
            )
            await self.db.commit()
            return cursor.lastrowid
        except aiosqlite.Error as e:
            raise DatabaseError(f"Failed to create session: {e}") from e

    async def end_session(
        self, session_id: int, ended_at: datetime, duration_s: float
    ) -> None:
        """Mark a session as ended."""
        try:
            await self.db.execute(
                "UPDATE sessions SET ended_at = ?, duration_s = ? WHERE id = ?",
                (ended_at.isoformat(), duration_s, session_id),
            )
            await self.db.commit()
        except aiosqlite.Error as e:
            raise DatabaseError(f"Failed to end session {session_id}: {e}") from e

    async def get_session(self, session_id: int) -> SessionRow | None:
        """Get a single session by id."""
        try:
            cursor = await self.db.execute(
                "SELECT * FROM sessions WHERE id = ?", (session_id,)
            )
            row = await cursor.fetchone()
            if row is None:
                return None
            return SessionRow(**dict(row))
        except aiosqlite.Error as e:
            raise DatabaseError(f"Failed to get session {session_id}: {e}") from e

    async def list_sessions(
        self, limit: int = 50, offset: int = 0
    ) -> list[SessionRow]:
        """List sessions ordered by most recent first."""
        try:
            cursor = await self.db.execute(
                "SELECT * FROM sessions ORDER BY started_at DESC LIMIT ? OFFSET ?",
                (limit, offset),
            )
            rows = await cursor.fetchall()
            return [SessionRow(**dict(r)) for r in rows]
        except aiosqlite.Error as e:
            raise DatabaseError(f"Failed to list sessions: {e}") from e

    async def delete_session(self, session_id: int) -> bool:
        """Delete a session and its segments (CASCADE). Returns True if found."""
        try:
            cursor = await self.db.execute(
                "DELETE FROM sessions WHERE id = ?", (session_id,)
            )
            await self.db.commit()
            return cursor.rowcount > 0
        except aiosqlite.Error as e:
            raise DatabaseError(f"Failed to delete session {session_id}: {e}") from e

    async def add_segment(
        self,
        session_id: int,
        text: str,
        start_ms: int,
        end_ms: int | None = None,
        confidence: float | None = None,
    ) -> int:
        """Add a transcription segment. Returns the segment id."""
        try:
            cursor = await self.db.execute(
                "INSERT INTO segments (session_id, text, start_ms, end_ms, confidence) "
                "VALUES (?, ?, ?, ?, ?)",
                (session_id, text, start_ms, end_ms, confidence),
            )
            await self.db.commit()
            return cursor.lastrowid
        except aiosqlite.Error as e:
            raise DatabaseError(f"Failed to add segment to session {session_id}: {e}") from e

    async def get_segments(self, session_id: int) -> list[SegmentRow]:
        """Get all segments for a session, ordered by start time."""
        try:
            cursor = await self.db.execute(
                "SELECT * FROM segments WHERE session_id = ? ORDER BY start_ms ASC",
                (session_id,),
            )
            rows = await cursor.fetchall()
            return [SegmentRow(**dict(r)) for r in rows]
        except aiosqlite.Error as e:
            raise DatabaseError(f"Failed to get segments for session {session_id}: {e}") from e

    async def get_session_full_text(self, session_id: int) -> str:
        """Get concatenated text of all segments for a session."""
        segments = await self.get_segments(session_id)
        return " ".join(seg.text for seg in segments)
