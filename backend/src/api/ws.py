"""WebSocket endpoints for real-time audio streaming and transcription.

Full implementation comes in Phase 2. This file provides the structure.
"""

from fastapi import APIRouter

ws_router = APIRouter()

# Phase 2: WebSocket endpoint for frontend <-> backend audio/transcription streaming
# @ws_router.websocket("/ws/transcribe")
# async def websocket_transcribe(websocket: WebSocket): ...
