"""Session CRUD endpoints (list, get, delete)."""

import logging

from fastapi import APIRouter, HTTPException

from src.search.vector_store import delete_session_embedding
from src.api._helpers import _get_repo, _session_to_dict

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/api/sessions")
async def list_sessions(limit: int = 50, offset: int = 0):
    """List all transcription sessions, most recent first."""
    repo = _get_repo()
    sessions = await repo.list_sessions(limit=limit, offset=offset)
    previews = await repo.get_session_previews([s.id for s in sessions])
    return {
        "sessions": [
            _session_to_dict(s, preview=previews.get(s.id, ""))
            for s in sessions
        ]
    }


@router.get("/api/sessions/{session_id}")
async def get_session(session_id: int):
    """Get a session with its segments."""
    repo = _get_repo()
    session = await repo.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    segments = await repo.get_segments(session_id)
    return {
        "session": {
            "id": session.id,
            "mode": session.mode,
            "language": session.language,
            "started_at": session.started_at,
            "ended_at": session.ended_at,
            "duration_s": session.duration_s,
            "summary": session.summary,
            "created_at": session.created_at,
            "filename": session.filename,
        },
        "segments": [
            {
                "id": seg.id,
                "text": seg.text,
                "start_ms": seg.start_ms,
                "end_ms": seg.end_ms,
                "confidence": seg.confidence,
            }
            for seg in segments
        ],
        "full_text": await repo.get_session_full_text(session_id),
    }


@router.delete("/api/sessions/{session_id}")
async def delete_session(session_id: int):
    """Delete a session and all its segments."""
    repo = _get_repo()
    deleted = await repo.delete_session(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        await delete_session_embedding(session_id)
    except Exception as e:
        logger.warning("Failed to delete ChromaDB embedding for session %d: %s", session_id, e)
    return {"deleted": True, "session_id": session_id}
