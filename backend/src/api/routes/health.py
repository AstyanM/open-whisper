"""Health check endpoint."""

import logging

from fastapi import APIRouter

from src.storage.database import get_db
from src.llm.client import is_llm_available, get_llm_config

logger = logging.getLogger(__name__)

router = APIRouter()


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
