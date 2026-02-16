"""REST API routes for health check, config, and session management."""

import logging

import yaml
from fastapi import APIRouter, HTTPException, Request

from src.audio.capture import AudioCapture
from src.config import AppConfig, find_config_path
from src.storage.database import get_db
from src.storage.repository import SessionRepository
from src.search.vector_store import delete_session_embedding, search_sessions as chroma_search

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

    # Transcription engine check
    try:
        from faster_whisper import WhisperModel  # noqa: F401
        from src.transcription.whisper_client import get_model_info

        model_size = config.models.transcription.model_size if config else "unknown"
        model_info = get_model_info()
        checks["transcription"] = {
            "status": "ok",
            "engine": "faster-whisper",
            "model": model_size,
            "device": model_info["actual_device"] or (config.models.transcription.device if config else "unknown"),
            "loaded": model_info["loaded"],
        }
    except ImportError:
        checks["transcription"] = {
            "status": "error",
            "message": "faster-whisper not installed",
        }
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

    return {"status": overall, "service": "openwhisper-backend", "checks": checks}


@router.get("/api/config")
async def get_config():
    """Return full application configuration."""
    from src.main import config

    if config is None:
        raise HTTPException(status_code=503, detail="Configuration not loaded")
    return config.model_dump()


# Fields that take effect immediately without restart
_HOT_RELOAD_PREFIXES = (
    "language",
    "overlay",
    "models.transcription.beam_size",
    "models.transcription.vad_filter",
    "models.transcription.buffer_duration_s",
    "models.transcription.model_size",
    "models.transcription.device",
    "models.transcription.compute_type",
)
# Fields that require an application restart
_RESTART_REQUIRED_PREFIXES = (
    "audio.device",
    "audio.chunk_duration_ms",
    "backend.",
    "storage.",
)


def _deep_merge(base: dict, override: dict) -> dict:
    """Deep merge *override* into *base*, returning a new dict."""
    result = base.copy()
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def _find_changed_paths(old: dict, new: dict, prefix: str = "") -> list[str]:
    """Return dot-separated paths whose values differ between *old* and *new*."""
    changed: list[str] = []
    for key in set(old.keys()) | set(new.keys()):
        path = f"{prefix}.{key}" if prefix else key
        old_val = old.get(key)
        new_val = new.get(key)
        if isinstance(old_val, dict) and isinstance(new_val, dict):
            changed.extend(_find_changed_paths(old_val, new_val, path))
        elif old_val != new_val:
            changed.append(path)
    return changed


@router.put("/api/config")
async def update_config(request: Request):
    """Validate, persist, and hot-reload configuration changes.

    Accepts a partial JSON body.  Fields are deep-merged with the current
    config, validated through Pydantic, written to ``config.yaml``, and
    loaded into memory.  The response tells the caller which changes were
    applied immediately and which require a restart.
    """
    import src.main

    if src.main.config is None:
        raise HTTPException(status_code=503, detail="Configuration not loaded")

    body = await request.json()

    current = src.main.config.model_dump()
    merged = _deep_merge(current, body)

    try:
        new_config = AppConfig.model_validate(merged)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    changed = _find_changed_paths(current, new_config.model_dump())

    applied = [
        p for p in changed if any(p.startswith(pr) for pr in _HOT_RELOAD_PREFIXES)
    ]
    restart_required = [
        p for p in changed if any(p.startswith(pr) for pr in _RESTART_REQUIRED_PREFIXES)
    ]

    # Persist to YAML
    config_path = find_config_path()
    with open(config_path, "w", encoding="utf-8") as fh:
        yaml.dump(
            new_config.model_dump(),
            fh,
            default_flow_style=False,
            allow_unicode=True,
            sort_keys=False,
        )

    # Update in-memory config
    src.main.config = new_config

    return {"status": "ok", "applied": applied, "restart_required": restart_required}


@router.get("/api/audio/devices")
async def list_audio_devices():
    """List available audio input devices."""
    try:
        devices = AudioCapture.list_devices()
    except Exception as exc:
        logger.error("Failed to list audio devices: %s", exc)
        raise HTTPException(
            status_code=500, detail="Failed to enumerate audio devices"
        )
    return {"devices": devices}


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


def _session_to_dict(s) -> dict:
    return {
        "id": s.id,
        "mode": s.mode,
        "language": s.language,
        "started_at": s.started_at,
        "ended_at": s.ended_at,
        "duration_s": s.duration_s,
        "created_at": s.created_at,
    }


@router.get("/api/sessions/search")
async def search_sessions_endpoint(
    q: str = "",
    language: str | None = None,
    mode: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    duration_min: float | None = None,
    duration_max: float | None = None,
    limit: int = 50,
    offset: int = 0,
):
    """Search sessions with optional semantic query and metadata filters."""
    repo = _get_repo()
    session_ids = None

    if q.strip():
        # Build ChromaDB where clause for metadata pre-filtering
        where_clauses = []
        if language:
            where_clauses.append({"language": language})
        if mode:
            where_clauses.append({"mode": mode})

        chroma_where = None
        if len(where_clauses) == 1:
            chroma_where = where_clauses[0]
        elif len(where_clauses) > 1:
            chroma_where = {"$and": where_clauses}

        try:
            session_ids = await chroma_search(
                query=q.strip(),
                n_results=limit + offset,
                where=chroma_where,
            )
        except Exception as e:
            logger.warning(f"ChromaDB search failed, falling back to SQL: {e}")
            session_ids = None

    sessions = await repo.filter_sessions(
        session_ids=session_ids,
        language=language if session_ids is None else None,  # Already filtered in ChromaDB
        mode=mode if session_ids is None else None,
        date_from=date_from,
        date_to=date_to,
        duration_min=duration_min,
        duration_max=duration_max,
        limit=limit,
        offset=offset,
    )

    return {"sessions": [_session_to_dict(s) for s in sessions]}


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
    try:
        await delete_session_embedding(session_id)
    except Exception:
        pass  # Non-fatal
    return {"deleted": True, "session_id": session_id}
