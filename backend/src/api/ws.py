"""WebSocket endpoint for real-time audio streaming and transcription."""

import asyncio
import json
import logging
import time
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from src.audio.capture import AudioCapture
from src.transcription.client import VLLMRealtimeClient
from src.storage.database import get_db
from src.storage.repository import SessionRepository

logger = logging.getLogger(__name__)

ws_router = APIRouter()


@ws_router.websocket("/ws/transcribe")
async def websocket_transcribe(websocket: WebSocket):
    """WebSocket endpoint for real-time transcription.

    Protocol:
    1. Client connects
    2. Client sends {"type": "start", "mode": "transcription", "language": "fr"}
    3. Server starts audio capture + vLLM streaming
    4. Server streams {"type": "transcript_delta", "delta": "...", "elapsed_ms": ...}
    5. Client sends {"type": "stop"} or disconnects
    6. Server finalizes, sends {"type": "session_ended", ...}
    """
    await websocket.accept()
    logger.info("WebSocket client connected")

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)

            if msg.get("type") == "start":
                mode = msg.get("mode", "transcription")
                language = msg.get("language")
                await _handle_transcription_session(
                    websocket, mode=mode, language_override=language
                )
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
        try:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": str(e),
            }))
        except Exception:
            pass


async def _handle_transcription_session(
    websocket: WebSocket,
    mode: str,
    language_override: str | None,
):
    """Orchestrate a single transcription session."""
    from src.main import config

    language = language_override or config.language

    # Create DB session
    db = get_db()
    repo = SessionRepository(db)
    started_at = datetime.now(timezone.utc)
    session_id = await repo.create_session(
        mode=mode, language=language, started_at=started_at
    )

    await websocket.send_text(json.dumps({
        "type": "session_started",
        "session_id": session_id,
        "started_at": started_at.isoformat(),
    }))

    # Audio capture
    capture = AudioCapture(
        sample_rate=config.audio.sample_rate,
        channels=config.audio.channels,
        chunk_duration_ms=config.audio.chunk_duration_ms,
        device=config.audio.device,
    )

    # vLLM client
    vllm_client = VLLMRealtimeClient(
        host="localhost",
        port=config.models.transcription.vllm_port,
        model=config.models.transcription.name,
    )

    full_text = ""
    session_start_time = time.monotonic()

    async def listen_for_stop():
        """Listen for stop command from the frontend."""
        try:
            while True:
                raw = await websocket.receive_text()
                msg = json.loads(raw)
                if msg.get("type") == "stop":
                    logger.info("Stop command received")
                    capture.stop()
                    return
        except WebSocketDisconnect:
            capture.stop()

    async def send_audio(session):
        """Stream audio from microphone to vLLM."""
        chunk_count = 0
        async for audio_b64 in capture.stream():
            await session.send_audio(audio_b64)
            chunk_count += 1
        logger.info(f"Audio stream ended after {chunk_count} chunks")
        # Signal end of audio
        await session._ws.send(json.dumps({
            "type": "input_audio_buffer.commit",
            "final": True,
        }))

    async def receive_and_forward(session):
        """Receive deltas from vLLM and forward to frontend."""
        nonlocal full_text
        async for delta in session.stream_transcription():
            full_text += delta
            elapsed_ms = int(
                (time.monotonic() - session_start_time) * 1000
            )
            await websocket.send_text(json.dumps({
                "type": "transcript_delta",
                "delta": delta,
                "elapsed_ms": elapsed_ms,
            }))

    try:
        await websocket.send_text(json.dumps({
            "type": "status",
            "state": "connecting_vllm",
        }))

        async with vllm_client.connect() as session:
            await websocket.send_text(json.dumps({
                "type": "status",
                "state": "recording",
            }))

            await asyncio.gather(
                listen_for_stop(),
                send_audio(session),
                receive_and_forward(session),
            )

    except Exception as e:
        logger.error(f"Transcription session error: {e}", exc_info=True)
        try:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": str(e),
                "code": "session_error",
            }))
        except Exception:
            pass

    # Finalize session
    ended_at = datetime.now(timezone.utc)
    duration_s = (ended_at - started_at).total_seconds()
    await repo.end_session(session_id, ended_at, duration_s)

    # Save segment
    if full_text.strip():
        segment_id = await repo.add_segment(
            session_id=session_id,
            text=full_text.strip(),
            start_ms=0,
            end_ms=int(duration_s * 1000),
        )
        try:
            await websocket.send_text(json.dumps({
                "type": "segment_complete",
                "segment_id": segment_id,
                "text": full_text.strip(),
                "start_ms": 0,
                "end_ms": int(duration_s * 1000),
            }))
        except Exception:
            pass

    try:
        await websocket.send_text(json.dumps({
            "type": "session_ended",
            "session_id": session_id,
            "duration_s": round(duration_s, 2),
        }))
    except Exception:
        pass

    logger.info(
        f"Session {session_id} ended: {duration_s:.1f}s, "
        f"{len(full_text)} chars"
    )
