"""Shared helpers for API route handlers."""

import logging

from fastapi import HTTPException

from src.storage.database import get_db
from src.storage.repository import SessionRepository

logger = logging.getLogger(__name__)


def _get_repo() -> SessionRepository:
    """Get a SessionRepository, raising 503 if DB is unavailable."""
    try:
        db = get_db()
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Database not available")
    return SessionRepository(db)


def _session_to_dict(
    s,
    preview: str | None = None,
    relevance: float | None = None,
    exact_match: bool | None = None,
) -> dict:
    d = {
        "id": s.id,
        "mode": s.mode,
        "language": s.language,
        "started_at": s.started_at,
        "ended_at": s.ended_at,
        "duration_s": s.duration_s,
        "summary": s.summary,
        "created_at": s.created_at,
        "filename": s.filename,
    }
    if preview is not None:
        d["preview"] = preview
    if relevance is not None:
        d["relevance"] = relevance
    if exact_match is not None:
        d["exact_match"] = exact_match
    return d
