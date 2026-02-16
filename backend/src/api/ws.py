"""WebSocket endpoint for real-time audio streaming and transcription."""

import asyncio
import base64
import json
import logging
import time
from datetime import datetime, timezone

import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from src.audio.capture import AudioCapture
from src.exceptions import (
    AudioDeviceError,
    DatabaseError,
    VLLMConnectionError,
    VLLMTimeoutError,
    VTSError,
)
from src.transcription.client import VLLMRealtimeClient
from src.storage.database import get_db
from src.storage.repository import SessionRepository
from src.search.vector_store import index_session

logger = logging.getLogger(__name__)

ws_router = APIRouter()


async def _send_ws_error(
    websocket: WebSocket, message: str, code: str = "internal_error"
) -> None:
    """Send an error message to the client, silently ignoring failures."""
    try:
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": message,
            "code": code,
        }))
    except Exception:
        logger.debug(f"Could not send error to client: {code}: {message}")


async def _send_ws_json(websocket: WebSocket, data: dict) -> None:
    """Send a JSON message to the client, silently ignoring failures."""
    try:
        await websocket.send_text(json.dumps(data))
    except Exception:
        logger.debug(f"Could not send message to client: {data.get('type', '?')}")


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
    except RuntimeError as e:
        # Starlette raises RuntimeError when trying to receive after disconnect
        if "disconnect" in str(e).lower():
            logger.info("WebSocket client disconnected")
        else:
            logger.error(f"WebSocket error: {e}", exc_info=True)
    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
        await _send_ws_error(websocket, str(e))


async def _handle_transcription_session(
    websocket: WebSocket,
    mode: str,
    language_override: str | None,
):
    """Orchestrate a single transcription session."""
    from src.main import config

    language = language_override or config.language

    # Create DB session
    try:
        db = get_db()
    except RuntimeError:
        await _send_ws_error(websocket, "Database not available", "database_error")
        return

    repo = SessionRepository(db)
    started_at = datetime.now(timezone.utc)

    try:
        session_id = await repo.create_session(
            mode=mode, language=language, started_at=started_at
        )
    except DatabaseError as e:
        logger.error(f"Failed to create session: {e}")
        await _send_ws_error(websocket, "Failed to create session", e.code)
        return

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

        async with vllm_client.connect(language=language) as session:
            await websocket.send_text(json.dumps({
                "type": "status",
                "state": "recording",
            }))

            await asyncio.gather(
                listen_for_stop(),
                send_audio(session),
                receive_and_forward(session),
            )

    except VLLMConnectionError as e:
        logger.error(f"vLLM connection failed: {e}")
        await _send_ws_error(websocket, str(e), e.code)
    except VLLMTimeoutError as e:
        logger.error(f"vLLM timeout: {e}")
        await _send_ws_error(websocket, str(e), e.code)
    except AudioDeviceError as e:
        logger.error(f"Audio device error: {e}")
        await _send_ws_error(websocket, str(e), e.code)
    except WebSocketDisconnect:
        logger.info("Client disconnected during session")
    except Exception as e:
        logger.error(f"Unexpected session error: {e}", exc_info=True)
        await _send_ws_error(websocket, "An unexpected error occurred")

    # Finalize session
    try:
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
            await _send_ws_json(websocket, {
                "type": "segment_complete",
                "segment_id": segment_id,
                "text": full_text.strip(),
                "start_ms": 0,
                "end_ms": int(duration_s * 1000),
            })

        # Index in ChromaDB for semantic search
        if full_text.strip():
            try:
                await index_session(
                    session_id=session_id,
                    full_text=full_text.strip(),
                    language=language,
                    mode=mode,
                    duration_s=round(duration_s, 2),
                    started_at=started_at.isoformat(),
                )
            except Exception as e:
                logger.warning(f"Failed to index session {session_id}: {e}")

        await _send_ws_json(websocket, {
            "type": "session_ended",
            "session_id": session_id,
            "duration_s": round(duration_s, 2),
        })

        logger.info(
            f"Session {session_id} ended: {duration_s:.1f}s, "
            f"{len(full_text)} chars"
        )
    except DatabaseError as e:
        logger.error(f"Failed to finalize session {session_id}: {e}")
        await _send_ws_error(websocket, "Failed to save session", e.code)
    except Exception as e:
        logger.error(f"Failed to finalize session {session_id}: {e}", exc_info=True)


@ws_router.websocket("/ws/mic-test")
async def websocket_mic_test(websocket: WebSocket):
    """WebSocket endpoint for microphone testing (volume meter).

    Protocol:
    1. Client connects
    2. Client sends {"type": "start", "device": "default"}
    3. Server captures audio and streams {"type": "level", "rms": 0.0-1.0}
    4. Client sends {"type": "stop"} or disconnects
    5. Server sends {"type": "stopped"}
    """
    await websocket.accept()
    logger.info("Mic-test client connected")

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)

            if msg.get("type") == "start":
                device = msg.get("device", "default")
                await _handle_mic_test(websocket, device)
    except WebSocketDisconnect:
        logger.info("Mic-test client disconnected")
    except RuntimeError as e:
        if "disconnect" in str(e).lower():
            logger.info("Mic-test client disconnected")
        else:
            logger.error(f"Mic-test error: {e}", exc_info=True)
    except Exception as e:
        logger.error(f"Mic-test error: {e}", exc_info=True)
        await _send_ws_error(websocket, str(e))


async def _handle_mic_test(websocket: WebSocket, device: str) -> None:
    """Capture audio and stream RMS volume levels back to the client."""
    from src.main import config

    capture = AudioCapture(
        sample_rate=config.audio.sample_rate,
        channels=config.audio.channels,
        chunk_duration_ms=config.audio.chunk_duration_ms,
        device=device if device != "default" else None,
    )

    stop_event = asyncio.Event()

    async def listen_for_stop():
        try:
            while not stop_event.is_set():
                raw = await websocket.receive_text()
                msg = json.loads(raw)
                if msg.get("type") == "stop":
                    stop_event.set()
                    capture.stop()
                    return
        except WebSocketDisconnect:
            stop_event.set()
            capture.stop()

    async def stream_levels():
        try:
            async for chunk_b64 in capture.stream():
                if stop_event.is_set():
                    break
                # Decode base64 → PCM16 int16 → compute RMS
                pcm_bytes = base64.b64decode(chunk_b64)
                samples = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32)
                rms = float(np.sqrt(np.mean(samples ** 2)) / 32768.0)
                await websocket.send_text(json.dumps({
                    "type": "level",
                    "rms": round(rms, 4),
                }))
        except Exception:
            pass  # stream ended
        finally:
            capture.stop()

    try:
        await websocket.send_text(json.dumps({"type": "started"}))
        await asyncio.gather(listen_for_stop(), stream_levels())
        await _send_ws_json(websocket, {"type": "stopped"})
    except AudioDeviceError as e:
        logger.error(f"Mic-test audio error: {e}")
        await _send_ws_error(websocket, str(e), e.code)
    except WebSocketDisconnect:
        logger.info("Mic-test client disconnected during test")
    except Exception as e:
        logger.error(f"Mic-test error: {e}", exc_info=True)
        await _send_ws_error(websocket, "An unexpected error occurred")
