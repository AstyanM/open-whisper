"""Backfill existing sessions into ChromaDB on first startup."""

import logging

from src.storage.repository import SessionRepository
from src.search.vector_store import index_session

logger = logging.getLogger(__name__)


async def backfill_index(repo: SessionRepository) -> int:
    """Index all existing sessions that have text. Returns count indexed."""
    sessions = await repo.list_sessions(limit=10000, offset=0)
    count = 0
    for s in sessions:
        text = await repo.get_session_full_text(s.id)
        if text.strip():
            await index_session(
                session_id=s.id,
                full_text=text,
                language=s.language,
                mode=s.mode,
                duration_s=s.duration_s,
                started_at=s.started_at,
            )
            count += 1
    return count
