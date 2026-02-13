"""REST API routes for health check, config, and session management."""

from fastapi import APIRouter, HTTPException

from src.storage.database import get_db
from src.storage.repository import SessionRepository

router = APIRouter()


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "voice-to-speech-local-backend"}


@router.get("/api/config")
async def get_config():
    """Return current (non-sensitive) configuration."""
    from src.main import config

    if config is None:
        return {"error": "Configuration not loaded"}
    return {
        "language": config.language,
        "audio": {
            "sample_rate": config.audio.sample_rate,
            "channels": config.audio.channels,
            "chunk_duration_ms": config.audio.chunk_duration_ms,
        },
        "models": {
            "transcription": config.models.transcription.name,
            "delay_ms": config.models.transcription.delay_ms,
        },
    }


@router.get("/api/sessions")
async def list_sessions(limit: int = 50, offset: int = 0):
    """List all transcription sessions, most recent first."""
    db = get_db()
    repo = SessionRepository(db)
    sessions = await repo.list_sessions(limit=limit, offset=offset)
    return {
        "sessions": [
            {
                "id": s.id,
                "mode": s.mode,
                "language": s.language,
                "started_at": s.started_at,
                "ended_at": s.ended_at,
                "duration_s": s.duration_s,
                "created_at": s.created_at,
            }
            for s in sessions
        ]
    }


@router.get("/api/sessions/{session_id}")
async def get_session(session_id: int):
    """Get a session with its segments."""
    db = get_db()
    repo = SessionRepository(db)
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
            "created_at": session.created_at,
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
    db = get_db()
    repo = SessionRepository(db)
    deleted = await repo.delete_session(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"deleted": True, "session_id": session_id}
