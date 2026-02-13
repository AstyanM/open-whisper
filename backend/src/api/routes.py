"""REST API routes for health check and basic info."""

from fastapi import APIRouter

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
