"""vLLM Realtime WebSocket client for Voxtral Mini 4B transcription.

Implements the OpenAI-compatible Realtime API protocol:
  1. Connect to ws://host:port/v1/realtime
  2. Receive session.created
  3. Send session.update with model name
  4. Send input_audio_buffer.commit (initial)
  5. Stream input_audio_buffer.append with base64 PCM16 chunks
  6. Send input_audio_buffer.commit with final=True when done
  7. Receive transcription.delta (partial) and transcription.done (final)
"""

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Callable

import websockets

from src.exceptions import VLLMConnectionError, VLLMTimeoutError, VLLMProtocolError

logger = logging.getLogger(__name__)

CONNECT_TIMEOUT_S = 10
HANDSHAKE_TIMEOUT_S = 10
RECV_TIMEOUT_S = 30


@dataclass
class TranscriptionResult:
    """Result from a completed transcription."""
    text: str
    usage: dict = field(default_factory=dict)


@dataclass
class TranscriptionDelta:
    """Partial transcription update."""
    delta: str


class VLLMRealtimeClient:
    """WebSocket client for vLLM Realtime API (Voxtral transcription).

    Usage:
        client = VLLMRealtimeClient(
            host="localhost", port=8000,
            model="mistralai/Voxtral-Mini-4B-Realtime-2602"
        )
        async with client.connect() as session:
            async for chunk_b64 in audio_source:
                await session.send_audio(chunk_b64)
            result = await session.finish()
            print(result.text)
    """

    def __init__(
        self,
        host: str = "localhost",
        port: int = 8000,
        model: str = "mistralai/Voxtral-Mini-4B-Realtime-2602",
    ):
        self.uri = f"ws://{host}:{port}/v1/realtime"
        self.model = model

    def connect(self, language: str | None = None) -> "RealtimeSession":
        """Create a new realtime transcription session.

        Use as async context manager:
            async with client.connect(language="fr") as session:
                ...
        """
        return RealtimeSession(self.uri, self.model, language=language)


class RealtimeSession:
    """A single realtime transcription session with vLLM.

    Manages the WebSocket connection lifecycle and the Realtime API protocol.
    """

    def __init__(self, uri: str, model: str, language: str | None = None):
        self.uri = uri
        self.model = model
        self.language = language
        self._ws = None
        self._session_id: str | None = None

    async def __aenter__(self):
        """Open WebSocket and perform session handshake."""
        logger.info(f"Connecting to vLLM Realtime API at {self.uri}")

        try:
            self._ws = await websockets.connect(
                self.uri, open_timeout=CONNECT_TIMEOUT_S
            )
        except (ConnectionRefusedError, OSError) as e:
            raise VLLMConnectionError(
                f"Cannot connect to vLLM at {self.uri}: {e}"
            ) from e
        except asyncio.TimeoutError:
            raise VLLMConnectionError(
                f"Connection to vLLM at {self.uri} timed out after {CONNECT_TIMEOUT_S}s"
            )

        # 1. Wait for session.created
        try:
            raw = await asyncio.wait_for(
                self._ws.recv(), timeout=HANDSHAKE_TIMEOUT_S
            )
            response = json.loads(raw)
        except asyncio.TimeoutError:
            raise VLLMTimeoutError(
                f"vLLM did not send session.created within {HANDSHAKE_TIMEOUT_S}s"
            )

        if response.get("type") != "session.created":
            raise VLLMProtocolError(
                f"Expected session.created, got: {response.get('type')}"
            )
        self._session_id = response.get("id", "unknown")
        logger.info(f"Session created: {self._session_id}")

        # 2. Send session.update with model
        await self._ws.send(json.dumps({
            "type": "session.update",
            "model": self.model,
        }))

        # 3. Send initial commit to signal readiness
        await self._ws.send(json.dumps({
            "type": "input_audio_buffer.commit",
        }))

        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Close the WebSocket connection."""
        if self._ws is not None:
            try:
                await self._ws.close()
            except Exception:
                logger.debug("Error closing vLLM WebSocket", exc_info=True)
            self._ws = None
            logger.info("Realtime session closed")

    async def send_audio(self, audio_base64: str):
        """Send a base64-encoded PCM16 audio chunk to vLLM.

        Args:
            audio_base64: Base64-encoded PCM16 audio data (16kHz, mono)
        """
        if self._ws is None:
            raise RuntimeError("Session not connected")

        await self._ws.send(json.dumps({
            "type": "input_audio_buffer.append",
            "audio": audio_base64,
        }))

    async def finish(self) -> TranscriptionResult:
        """Signal end of audio and collect the final transcription.

        Sends input_audio_buffer.commit with final=True, then reads
        transcription.delta and transcription.done events.

        Returns:
            TranscriptionResult with the complete transcribed text.
        """
        if self._ws is None:
            raise RuntimeError("Session not connected")

        # Signal all audio has been sent
        await self._ws.send(json.dumps({
            "type": "input_audio_buffer.commit",
            "final": True,
        }))

        # Collect transcription
        full_text = ""
        while True:
            try:
                raw = await asyncio.wait_for(
                    self._ws.recv(), timeout=RECV_TIMEOUT_S
                )
            except asyncio.TimeoutError:
                raise VLLMTimeoutError(
                    f"vLLM did not respond within {RECV_TIMEOUT_S}s during finish"
                )
            response = json.loads(raw)
            msg_type = response.get("type", "")

            if msg_type == "transcription.delta":
                delta = response.get("delta", "")
                full_text += delta
                logger.debug(f"Delta: {delta}")

            elif msg_type == "transcription.done":
                final_text = response.get("text", full_text)
                usage = response.get("usage", {})
                logger.info(f"Transcription complete: {len(final_text)} chars")
                return TranscriptionResult(text=final_text, usage=usage)

            elif msg_type == "error":
                error_msg = response.get("error", "Unknown error")
                raise RuntimeError(f"vLLM error: {error_msg}")

            else:
                logger.debug(f"Ignoring message type: {msg_type}")

    async def stream_transcription(
        self,
        on_delta: Callable[[str], None] | None = None,
    ):
        """Yield transcription deltas as they arrive.

        This is an alternative to finish() that provides streaming output.
        Call this after sending all audio chunks and the final commit.

        Args:
            on_delta: Optional callback invoked with each text delta.

        Yields:
            Text deltas as they arrive from vLLM.
        """
        if self._ws is None:
            raise RuntimeError("Session not connected")

        while True:
            try:
                raw = await asyncio.wait_for(
                    self._ws.recv(), timeout=RECV_TIMEOUT_S
                )
            except asyncio.TimeoutError:
                raise VLLMTimeoutError(
                    f"vLLM did not respond within {RECV_TIMEOUT_S}s during streaming"
                )
            response = json.loads(raw)
            msg_type = response.get("type", "")

            if msg_type == "transcription.delta":
                delta = response.get("delta", "")
                if not delta:
                    continue
                if on_delta:
                    on_delta(delta)
                yield delta

            elif msg_type == "transcription.done":
                return

            elif msg_type == "error":
                error_msg = response.get("error", "Unknown error")
                raise RuntimeError(f"vLLM error: {error_msg}")
