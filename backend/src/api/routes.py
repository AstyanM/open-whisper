"""REST API routes for health check, config, and session management."""

import json
import logging
import math
import tempfile
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import yaml
from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form

from src.audio.capture import AudioCapture
from src.config import AppConfig, find_config_path
from src.storage.database import get_db
from src.storage.repository import SessionRepository
from src.search.vector_store import delete_session_embedding, index_session, search_sessions as chroma_search
from src.llm.client import is_llm_available, summarize_text, rewrite_text, process_text, get_llm_config

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

    # LLM check
    if is_llm_available():
        llm_cfg = get_llm_config()
        checks["llm"] = {
            "status": "ok",
            "api_url": llm_cfg.api_url if llm_cfg else "unknown",
            "model": llm_cfg.model if llm_cfg else "unknown",
        }
    else:
        checks["llm"] = {"status": "disabled"}

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
    "models.llm",
    "search.distance_threshold",
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

    # Re-initialize LLM client if config changed
    if any(p.startswith("models.llm") for p in changed):
        from src.llm.client import init_llm_client, close_llm_client
        close_llm_client()
        init_llm_client(new_config.models.llm)

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
    previews = await repo.get_session_previews([s.id for s in sessions])
    return {
        "sessions": [
            _session_to_dict(s, preview=previews.get(s.id, ""))
            for s in sessions
        ]
    }



def _strip_accents(text: str) -> str:
    """Remove accents/diacritics for accent-insensitive matching."""
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


# Stopwords stripped from query for exact-match keyword checking (not for cosine similarity).
_STOPWORDS_PATH = Path(__file__).resolve().parent.parent / "search" / "stopwords.json"
with open(_STOPWORDS_PATH, encoding="utf-8") as _f:
    _STOPWORDS: set[str] = {w for words in json.load(_f).values() for w in words}


def _is_exact_match(query: str, document: str) -> bool:
    """Check if ALL non-stopword query words appear in the document (case + accent insensitive)."""
    norm_doc = _strip_accents(document).lower()
    words = _strip_accents(query).lower().split()
    content_words = [w for w in words if w not in _STOPWORDS]
    return all(w in norm_doc for w in content_words) if content_words else False


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
    relevance_scores: dict[int, float] = {}
    exact_matches: set[int] = set()

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

        # Load distance threshold from config
        from src.main import config as app_config
        threshold = app_config.search.distance_threshold if app_config else 0.75

        try:
            search_results = await chroma_search(
                query=q.strip(),
                n_results=limit + offset,
                where=chroma_where,
                distance_threshold=threshold,
            )

            # Classify exact matches (all query words in document)
            for sid, d, doc in search_results:
                if _is_exact_match(q.strip(), doc):
                    exact_matches.add(sid)

            # Rank: exact matches first (by distance), then non-exact (by distance)
            exact = [(sid, d) for sid, d, _ in search_results if sid in exact_matches]
            non_exact = [(sid, d) for sid, d, _ in search_results if sid not in exact_matches]
            ranked = exact + non_exact

            session_ids = [sid for sid, _ in ranked]
            relevance_scores = {
                sid: round(math.sqrt(max(0.0, 1.0 - d)), 4)
                for sid, d in ranked
            }
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

    previews = await repo.get_session_previews([s.id for s in sessions])
    return {
        "sessions": [
            _session_to_dict(
                s,
                preview=previews.get(s.id, ""),
                relevance=relevance_scores.get(s.id),
                exact_match=s.id in exact_matches if exact_matches else None,
            )
            for s in sessions
        ],
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


@router.post("/api/sessions/{session_id}/summarize")
async def summarize_session(session_id: int):
    """Generate or regenerate a summary for a session using LLM."""
    if not is_llm_available():
        raise HTTPException(status_code=503, detail="LLM not configured or disabled")

    repo = _get_repo()
    session = await repo.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    full_text = await repo.get_session_full_text(session_id)
    if not full_text or not full_text.strip():
        raise HTTPException(status_code=400, detail="Session has no text to summarize")

    try:
        summary = await summarize_text(full_text, language=session.language)
    except Exception as e:
        logger.error(f"LLM summarization failed for session {session_id}: {e}")
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    await repo.update_session_summary(session_id, summary)

    # Re-index in ChromaDB with the summary for better search relevance
    try:
        await index_session(
            session_id=session_id,
            full_text=full_text,
            summary=summary,
            language=session.language,
            mode=session.mode,
            duration_s=session.duration_s,
            started_at=session.started_at,
        )
    except Exception as e:
        logger.warning(f"Failed to re-index session {session_id} after summary: {e}")

    return {"session_id": session_id, "summary": summary}


@router.post("/api/llm/rewrite")
async def rewrite_text_endpoint(request: Request):
    """Rewrite/clean up arbitrary text using LLM."""
    if not is_llm_available():
        raise HTTPException(status_code=503, detail="LLM not configured or disabled")

    body = await request.json()
    text = body.get("text", "")
    instruction = body.get("instruction")

    if not text.strip():
        raise HTTPException(status_code=400, detail="No text provided")

    try:
        result = await rewrite_text(text, instruction)
    except Exception as e:
        logger.error(f"LLM rewrite failed: {e}")
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    return {"original": text, "rewritten": result}


@router.post("/api/llm/process")
async def process_text_endpoint(request: Request):
    """Process transcription text with a scenario-specific LLM prompt."""
    if not is_llm_available():
        raise HTTPException(status_code=503, detail="LLM not configured or disabled")

    body = await request.json()
    text = body.get("text", "")
    scenario = body.get("scenario", "")
    language = body.get("language", "en")

    if not text.strip():
        raise HTTPException(status_code=400, detail="No text provided")
    if not scenario:
        raise HTTPException(status_code=400, detail="No scenario provided")

    try:
        result = await process_text(text, scenario, language)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"LLM process failed (scenario={scenario}): {e}")
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    return {"scenario": scenario, "result": result}


# --- File upload transcription ---

ACCEPTED_AUDIO_EXTENSIONS = {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".webm", ".wma", ".aac", ".opus"}


@router.post("/api/transcribe/file")
async def upload_file_for_transcription(
    file: UploadFile = File(...),
    language: str = Form("fr"),
):
    """Upload an audio file for transcription.

    Returns session_id immediately. Connect to /ws/transcribe-file/{session_id}
    for real-time transcription progress.
    """
    from src.main import config as app_config
    max_size_mb = app_config.max_upload_size_mb if app_config else 500
    max_size = max_size_mb * 1024 * 1024

    filename = file.filename or "unknown"
    ext = Path(filename).suffix.lower()
    if ext not in ACCEPTED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format: {ext}. Accepted: {', '.join(sorted(ACCEPTED_AUDIO_EXTENSIONS))}",
        )

    content = await file.read()
    if len(content) > max_size:
        raise HTTPException(status_code=413, detail=f"File too large (max {max_size_mb} MB)")

    # Save to temp directory
    temp_dir = Path(tempfile.gettempdir()) / "openwhisper_uploads"
    temp_dir.mkdir(exist_ok=True)
    temp_path = temp_dir / f"{int(datetime.now().timestamp())}_{filename}"
    temp_path.write_bytes(content)

    # Create DB session
    repo = _get_repo()
    started_at = datetime.now(timezone.utc)
    session_id = await repo.create_session(
        mode="file",
        language=language,
        started_at=started_at,
        filename=filename,
    )

    # Register for the WebSocket handler to pick up
    from src.api._file_transcription_state import register_pending_transcription
    register_pending_transcription(session_id, temp_path, language, started_at, filename)

    logger.info(f"File uploaded for transcription: {filename} -> session {session_id}")
    return {"session_id": session_id, "status": "pending"}


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
