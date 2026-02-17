"""WebSocket endpoint for real-time audio streaming and transcription."""

import asyncio
import base64
import json
import logging
import os
import time
from datetime import datetime, timezone

import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from src.audio.capture import AudioCapture
from src.exceptions import (
    AudioDeviceError,
    DatabaseError,
    WhisperModelError,
)
from src.transcription.whisper_client import WhisperClient
from src.storage.database import get_db
from src.storage.repository import SessionRepository
from src.llm.client import is_llm_available, summarize_text
from src.search.vector_store import index_session

from src.debug_log import debug_log as _debug_log

logger = logging.getLogger(__name__)


def _debug(msg: str) -> None:
    """Convenience wrapper for debug_log with WS tag."""
    _debug_log("WS", msg)


# Module-level marker: if this appears in the log file, the correct code is loaded
_debug(f"===== ws.py MODULE LOADED (pid={os.getpid()}) =====")

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
    3. Server starts audio capture + Whisper transcription
    4. Server streams {"type": "transcript_delta", "delta": "...", "elapsed_ms": ...}
    5. Client sends {"type": "stop"} or disconnects
    6. Server finalizes, sends {"type": "session_ended", ...}
    """
    await websocket.accept()
    _debug("[WS] WebSocket client connected")
    logger.info("WebSocket client connected")

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            _debug(f"[WS] Received message: {msg.get('type', '?')}")

            if msg.get("type") == "start":
                mode = msg.get("mode", "transcription")
                if mode not in ("transcription", "dictation"):
                    await _send_ws_error(websocket, f"Invalid mode: {mode}", "invalid_mode")
                    continue
                language = msg.get("language")
                _debug(f"[WS] Starting session: mode={mode}, language={language}")
                await _handle_transcription_session(
                    websocket, mode=mode, language_override=language
                )
    except WebSocketDisconnect:
        _debug("[WS] WebSocket client disconnected")
        logger.info("WebSocket client disconnected")
    except RuntimeError as e:
        # Starlette raises RuntimeError when trying to receive after disconnect
        if "disconnect" in str(e).lower():
            _debug("[WS] WebSocket client disconnected (RuntimeError)")
            logger.info("WebSocket client disconnected")
        else:
            _debug(f"[WS] WebSocket error: {e}")
            logger.error(f"WebSocket error: {e}", exc_info=True)
    except Exception as e:
        _debug(f"[WS] WebSocket error: {e}")
        logger.error(f"WebSocket error: {e}", exc_info=True)
        await _send_ws_error(websocket, str(e))


async def _handle_transcription_session(
    websocket: WebSocket,
    mode: str,
    language_override: str | None,
):
    """Orchestrate a single transcription session."""
    from src.main import config
    from src.config import SUPPORTED_LANGUAGES

    _debug(f"[WS] _handle_transcription_session: mode={mode}, language_override={language_override}")

    language = language_override or config.language
    if language not in SUPPORTED_LANGUAGES:
        logger.warning("Unsupported language %r requested, falling back to config default", language)
        language = config.language

    # Create DB session
    try:
        db = get_db()
    except RuntimeError:
        _debug("[WS] Database not available!")
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

    _debug(f"[WS] Session {session_id} created")

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

    # Whisper client
    whisper_client = WhisperClient(
        config=config.models.transcription,
        sample_rate=config.audio.sample_rate,
    )

    full_text = ""
    session_start_time = time.monotonic()
    stop_event = asyncio.Event()

    async def listen_for_stop():
        """Listen for stop command from the frontend."""
        try:
            while True:
                raw = await websocket.receive_text()
                msg = json.loads(raw)
                if msg.get("type") == "stop":
                    _debug("[WS] Stop command received from client")
                    logger.info("Stop command received")
                    stop_event.set()
                    capture.stop()
                    return
        except WebSocketDisconnect:
            _debug("[WS] Client disconnected in listen_for_stop")
            stop_event.set()
            capture.stop()

    async def send_audio(session):
        """Stream audio from microphone to Whisper."""
        chunk_count = 0
        _debug("[WS] send_audio: starting audio stream...")
        async for audio_b64 in capture.stream():
            await session.send_audio(audio_b64)
            chunk_count += 1
            if chunk_count % 100 == 0:
                _debug(f"[WS] Audio chunks sent: {chunk_count}")
                logger.info(f"[WS] Audio chunks sent: {chunk_count}")
        _debug(f"[WS] Audio stream ended after {chunk_count} chunks")
        logger.info(f"[WS] Audio stream ended after {chunk_count} chunks")
        await session.signal_end_of_audio()
        _debug("[WS] send_audio task complete")
        logger.info("[WS] send_audio task complete")

    async def receive_and_forward(session):
        """Receive deltas from Whisper and forward to frontend."""
        nonlocal full_text
        delta_count = 0
        _debug("[WS] receive_and_forward: waiting for deltas...")
        async for delta in session.stream_transcription():
            full_text += delta
            delta_count += 1
            elapsed_ms = int(
                (time.monotonic() - session_start_time) * 1000
            )
            _debug(f"[WS] Forwarding delta #{delta_count}: {repr(delta[:60])}")
            logger.info(f"[WS] Forwarding delta #{delta_count}: {repr(delta[:60])}")
            await websocket.send_text(json.dumps({
                "type": "transcript_delta",
                "delta": delta,
                "elapsed_ms": elapsed_ms,
            }))
        _debug(f"[WS] receive_and_forward complete ({delta_count} deltas, {len(full_text)} chars)")
        logger.info(f"[WS] receive_and_forward complete ({delta_count} deltas, {len(full_text)} chars)")

    try:
        _debug("[WS] Sending loading_model status")
        logger.info("[WS] Sending loading_model status")
        await websocket.send_text(json.dumps({
            "type": "status",
            "state": "loading_model",
        }))

        async with whisper_client.connect(language=language) as session:
            _debug(f"[WS] Model loaded, sending recording status (device={session.actual_device})")
            logger.info("[WS] Model loaded, sending recording status (device=%s)", session.actual_device)
            await websocket.send_text(json.dumps({
                "type": "status",
                "state": "recording",
                "device": session.actual_device,
            }))

            _debug("[WS] Starting gather (listen_for_stop, send_audio, receive_and_forward)")
            logger.info("[WS] Starting gather (listen_for_stop, send_audio, receive_and_forward)")
            try:
                await asyncio.wait_for(
                    asyncio.gather(
                        listen_for_stop(),
                        send_audio(session),
                        receive_and_forward(session),
                    ),
                    timeout=300,  # 5 minutes max session
                )
            except asyncio.TimeoutError:
                _debug("[WS] Session timed out after 5 minutes")
                logger.warning("[WS] Session timed out after 5 minutes")
            _debug("[WS] Gather completed")
            logger.info("[WS] Gather completed, all tasks done")

    except WhisperModelError as e:
        _debug(f"[WS] Whisper model error: {e}")
        logger.error(f"Whisper model error: {e}")
        await _send_ws_error(websocket, str(e), e.code)
    except AudioDeviceError as e:
        _debug(f"[WS] Audio device error: {e}")
        logger.error(f"Audio device error: {e}")
        await _send_ws_error(websocket, str(e), e.code)
    except WebSocketDisconnect:
        _debug("[WS] Client disconnected during session")
        logger.info("Client disconnected during session")
    except Exception as e:
        _debug(f"[WS] Unexpected session error: {e}")
        logger.error(f"Unexpected session error: {e}", exc_info=True)
        await _send_ws_error(websocket, "An unexpected error occurred")

    # Finalize session — notify frontend immediately
    _debug(f"[WS] Finalizing session {session_id}...")
    await _send_ws_json(websocket, {
        "type": "status",
        "state": "finalizing",
    })

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

        _debug(f"[WS] Sending session_ended for session {session_id}")
        await _send_ws_json(websocket, {
            "type": "session_ended",
            "session_id": session_id,
            "duration_s": round(duration_s, 2),
        })

        _debug(f"[WS] Session {session_id} ended: {duration_s:.1f}s, {len(full_text)} chars")
        logger.info(
            f"Session {session_id} ended: {duration_s:.1f}s, "
            f"{len(full_text)} chars"
        )

        # Auto-summarize in background (non-blocking)
        if full_text.strip() and is_llm_available():
            try:
                from src.main import config as app_config
                if app_config and app_config.models.llm.auto_summarize:
                    asyncio.create_task(
                        _auto_summarize(session_id, full_text.strip(), repo, language=language)
                    )
            except Exception as e:
                logger.warning(f"Failed to launch auto-summary for session {session_id}: {e}")

    except DatabaseError as e:
        _debug(f"[WS] Failed to finalize session {session_id}: {e}")
        logger.error(f"Failed to finalize session {session_id}: {e}")
        await _send_ws_error(websocket, "Failed to save session", e.code)
    except Exception as e:
        _debug(f"[WS] Failed to finalize session {session_id}: {e}")
        logger.error(f"Failed to finalize session {session_id}: {e}", exc_info=True)


async def _auto_summarize(session_id: int, text: str, repo: SessionRepository, language: str = "en") -> None:
    """Background task: generate and save a summary for a session, then re-index in ChromaDB."""
    try:
        summary = await summarize_text(text, language=language)
        if summary:
            await repo.update_session_summary(session_id, summary)
            logger.info(f"Auto-summary generated for session {session_id} ({len(summary)} chars)")
            # Re-index in ChromaDB with the summary for better search relevance
            try:
                session = await repo.get_session(session_id)
                if session:
                    await index_session(
                        session_id=session_id,
                        full_text=text,
                        summary=summary,
                        language=session.language,
                        mode=session.mode,
                        duration_s=session.duration_s,
                        started_at=session.started_at,
                    )
            except Exception as e:
                logger.warning(f"Failed to re-index session {session_id} after summary: {e}")
    except Exception as e:
        logger.warning(f"Auto-summary failed for session {session_id}: {e}")


@ws_router.websocket("/ws/transcribe-file/{session_id}")
async def websocket_transcribe_file(websocket: WebSocket, session_id: int):
    """WebSocket endpoint for file transcription progress.

    Protocol:
    1. Client connects after POST /api/transcribe/file returns session_id
    2. Server starts transcription from the uploaded file
    3. Server streams: status, transcript_delta (with timestamps), progress, session_ended
    4. Client can send {"type": "cancel"} to abort
    """
    await websocket.accept()
    _debug(f"[FILE-WS] Client connected for session {session_id}")
    logger.info("File transcription WS client connected for session %d", session_id)

    from src.api._file_transcription_state import (
        get_pending_transcription,
        remove_pending_transcription,
    )

    pending = get_pending_transcription(session_id)
    if not pending:
        await _send_ws_error(websocket, "No pending transcription for this session", "not_found")
        await websocket.close()
        return

    try:
        await _handle_file_transcription(websocket, pending)
    except WebSocketDisconnect:
        _debug(f"[FILE-WS] Client disconnected during file transcription {session_id}")
        logger.info("File transcription WS client disconnected (session %d)", session_id)
    except Exception as e:
        _debug(f"[FILE-WS] Error for session {session_id}: {e}")
        logger.error("File transcription error for session %d: %s", session_id, e, exc_info=True)
        await _send_ws_error(websocket, str(e))
    finally:
        # Clean up temp file
        try:
            pending.file_path.unlink(missing_ok=True)
        except Exception:
            pass
        remove_pending_transcription(session_id)


async def _handle_file_transcription(websocket: WebSocket, pending):
    """Orchestrate file transcription with progress streaming."""
    from src.main import config
    from src.transcription.file_transcriber import transcribe_file_streaming

    session_id = pending.session_id
    language = pending.language
    started_at = pending.started_at
    filename = pending.filename

    # Get DB repo
    try:
        db = get_db()
    except RuntimeError:
        await _send_ws_error(websocket, "Database not available", "database_error")
        return
    repo = SessionRepository(db)

    # Send loading_model status
    await _send_ws_json(websocket, {"type": "status", "state": "loading_model"})

    # Set up cancel listener
    cancel_event = asyncio.Event()

    async def listen_for_cancel():
        try:
            while not cancel_event.is_set():
                raw = await websocket.receive_text()
                msg = json.loads(raw)
                if msg.get("type") == "cancel":
                    _debug(f"[FILE-WS] Cancel received for session {session_id}")
                    cancel_event.set()
                    return
        except WebSocketDisconnect:
            cancel_event.set()

    cancel_task = asyncio.create_task(listen_for_cancel())

    full_text = ""
    segment_count = 0
    session_start_time = time.monotonic()
    audio_duration_s = 0.0

    try:
        audio_duration_s, segments = await transcribe_file_streaming(
            file_path=pending.file_path,
            config=config.models.transcription,
            language=language,
        )

        # Send transcribing status + file info
        await _send_ws_json(websocket, {"type": "status", "state": "transcribing"})
        await _send_ws_json(websocket, {
            "type": "file_info",
            "audio_duration_s": round(audio_duration_s, 2),
            "filename": filename,
        })

        async for seg in segments:
            if cancel_event.is_set():
                _debug(f"[FILE-WS] Cancelled at segment {segment_count}")
                break

            full_text += (" " if full_text else "") + seg.text
            segment_count += 1

            # Calculate progress
            progress = min(100.0, (seg.end_ms / 1000.0 / audio_duration_s) * 100) if audio_duration_s > 0 else 0
            elapsed_ms = int((time.monotonic() - session_start_time) * 1000)

            # Send transcript delta (compatible with live transcription format)
            await _send_ws_json(websocket, {
                "type": "transcript_delta",
                "delta": (" " if segment_count > 1 else "") + seg.text,
                "elapsed_ms": elapsed_ms,
                "start_ms": seg.start_ms,
                "end_ms": seg.end_ms,
            })

            # Send progress
            await _send_ws_json(websocket, {
                "type": "progress",
                "percent": round(progress, 1),
            })

            # Save segment to DB with real timestamps
            await repo.add_segment(
                session_id=session_id,
                text=seg.text,
                start_ms=seg.start_ms,
                end_ms=seg.end_ms,
                confidence=seg.confidence,
            )

    except WhisperModelError as e:
        _debug(f"[FILE-WS] Model error for session {session_id}: {e}")
        await _send_ws_error(websocket, str(e), e.code)
        return
    except Exception as e:
        _debug(f"[FILE-WS] Transcription failed for session {session_id}: {e}")
        logger.error("File transcription failed for session %d: %s", session_id, e, exc_info=True)
        await _send_ws_error(websocket, f"Transcription failed: {e}")
        return
    finally:
        cancel_task.cancel()

    # Finalization
    await _send_ws_json(websocket, {"type": "status", "state": "finalizing"})
    _debug(f"[FILE-WS] Finalizing session {session_id}: {segment_count} segments, {len(full_text)} chars")

    try:
        ended_at = datetime.now(timezone.utc)
        # Use audio duration (not wall-clock time)
        duration_s = audio_duration_s if audio_duration_s > 0 else (ended_at - started_at).total_seconds()
        await repo.end_session(session_id, ended_at, duration_s)

        # Index in ChromaDB
        if full_text.strip():
            try:
                await index_session(
                    session_id=session_id,
                    full_text=full_text.strip(),
                    language=language,
                    mode="file",
                    duration_s=round(duration_s, 2),
                    started_at=started_at.isoformat(),
                )
            except Exception as e:
                logger.warning("Failed to index file session %d: %s", session_id, e)

        await _send_ws_json(websocket, {
            "type": "session_ended",
            "session_id": session_id,
            "duration_s": round(duration_s, 2),
            "segment_count": segment_count,
        })

        _debug(f"[FILE-WS] Session {session_id} ended: {duration_s:.1f}s audio, {segment_count} segments")
        logger.info(
            "File session %d ended: %.1fs audio, %d segments, %d chars",
            session_id, duration_s, segment_count, len(full_text),
        )

        # Auto-summarize in background
        if full_text.strip() and is_llm_available():
            try:
                from src.main import config as app_config
                if app_config and app_config.models.llm.auto_summarize:
                    asyncio.create_task(
                        _auto_summarize(session_id, full_text.strip(), repo, language=language)
                    )
            except Exception as e:
                logger.warning("Failed to launch auto-summary for file session %d: %s", session_id, e)

    except DatabaseError as e:
        _debug(f"[FILE-WS] Failed to finalize session {session_id}: {e}")
        logger.error("Failed to finalize file session %d: %s", session_id, e)
        await _send_ws_error(websocket, "Failed to save session", e.code)
    except Exception as e:
        _debug(f"[FILE-WS] Failed to finalize session {session_id}: {e}")
        logger.error("Failed to finalize file session %d: %s", session_id, e, exc_info=True)


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
        msg_lower = str(e).lower()
        if "disconnect" in msg_lower or "not connected" in msg_lower:
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
        except WebSocketDisconnect:
            pass  # client disconnected, expected
        except Exception as e:
            logger.warning("Mic test stream error: %s", e)
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
