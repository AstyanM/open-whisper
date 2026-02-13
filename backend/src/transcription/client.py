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

import json
import logging
from dataclasses import dataclass, field
from typing import Callable

import websockets

logger = logging.getLogger(__name__)


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

    def connect(self) -> "RealtimeSession":
        """Create a new realtime transcription session.

        Use as async context manager:
            async with client.connect() as session:
                ...
        """
        return RealtimeSession(self.uri, self.model)


class RealtimeSession:
    """A single realtime transcription session with vLLM.

    Manages the WebSocket connection lifecycle and the Realtime API protocol.
    """

    def __init__(self, uri: str, model: str):
        self.uri = uri
        self.model = model
        self._ws = None
        self._session_id: str | None = None

    async def __aenter__(self):
        """Open WebSocket and perform session handshake."""
        logger.info(f"Connecting to vLLM Realtime API at {self.uri}")
        self._ws = await websockets.connect(self.uri)

        # 1. Wait for session.created
        response = json.loads(await self._ws.recv())
        if response.get("type") != "session.created":
            raise RuntimeError(f"Expected session.created, got: {response}")
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
            await self._ws.close()
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
            response = json.loads(await self._ws.recv())
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
            response = json.loads(await self._ws.recv())
            msg_type = response.get("type", "")

            if msg_type == "transcription.delta":
                delta = response.get("delta", "")
                if on_delta:
                    on_delta(delta)
                yield delta

            elif msg_type == "transcription.done":
                return

            elif msg_type == "error":
                error_msg = response.get("error", "Unknown error")
                raise RuntimeError(f"vLLM error: {error_msg}")
