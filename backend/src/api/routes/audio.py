"""Audio device listing endpoint."""

import logging

from fastapi import APIRouter, HTTPException

from src.audio.capture import AudioCapture

logger = logging.getLogger(__name__)

router = APIRouter()


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
