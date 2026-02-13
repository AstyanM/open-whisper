"""REST API routes for health check, config, and session management."""

import asyncio
import logging

import websockets
from fastapi import APIRouter, HTTPException

from src.storage.database import get_db
from src.storage.repository import SessionRepository

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_repo() -> SessionRepository:
    """Get a SessionRepository, raising 503 if DB is unavailable."""
    try:
        db = get_db()
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Database not available")
    return SessionRepository(db)


@router.get("/health")
async def health_check():
    """Health check with dependency status."""
    from src.main import config

    checks = {}
    overall = "healthy"

    # Database check
    try:
        db = get_db()
        await db.execute("SELECT 1")
        checks["database"] = {"status": "ok"}
    except Exception as e:
        checks["database"] = {"status": "error", "message": str(e)}
        overall = "unhealthy"

    # vLLM check
    try:
        if config:
            port = config.models.transcription.vllm_port
            uri = f"ws://localhost:{port}/v1/realtime"
            ws = await asyncio.wait_for(
                websockets.connect(uri, open_timeout=3), timeout=3
            )
            await ws.close()
            checks["vllm"] = {"status": "ok"}
        else:
            checks["vllm"] = {"status": "unknown", "message": "Config not loaded"}
            if overall == "healthy":
                overall = "degraded"
    except Exception:
        checks["vllm"] = {"status": "error", "message": "vLLM unreachable"}
        if overall == "healthy":
            overall = "degraded"

    # Audio device check
    try:
        import sounddevice as sd
        devices = sd.query_devices()
        input_devices = [d for d in devices if d["max_input_channels"] > 0]
        if input_devices:
            checks["audio"] = {"status": "ok", "input_devices": len(input_devices)}
        else:
            checks["audio"] = {"status": "error", "message": "No input devices found"}
            if overall == "healthy":
                overall = "degraded"
    except Exception as e:
        checks["audio"] = {"status": "error", "message": str(e)}
        if overall == "healthy":
            overall = "degraded"

    return {"status": overall, "service": "voice-to-speech-local-backend", "checks": checks}


@router.get("/api/config")
async def get_config():
    """Return current (non-sensitive) configuration."""
    from src.main import config

    if config is None:
        raise HTTPException(status_code=503, detail="Configuration not loaded")
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
    repo = _get_repo()
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
    repo = _get_repo()
    deleted = await repo.delete_session(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"deleted": True, "session_id": session_id}
