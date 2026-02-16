"""Audio capture module using sounddevice.

Captures audio from the system microphone in PCM16 format at 16kHz mono,
and provides chunks as base64-encoded strings suitable for the Whisper
transcription engine.
"""

import asyncio
import base64
import logging

import numpy as np
import sounddevice as sd

from src.exceptions import AudioDeviceError, AudioDeviceNotFoundError

logger = logging.getLogger(__name__)


class AudioCapture:
    """Captures audio from the microphone and yields base64 PCM16 chunks.

    Usage:
        capture = AudioCapture(sample_rate=16000, channels=1, chunk_duration_ms=80)
        async for chunk_b64 in capture.stream():
            # chunk_b64 is a base64-encoded string of PCM16 audio
            ...
        # Call capture.stop() to stop recording
    """

    def __init__(
        self,
        sample_rate: int = 16000,
        channels: int = 1,
        chunk_duration_ms: int = 80,
        device: str | int | None = None,
    ):
        self.sample_rate = sample_rate
        self.channels = channels
        self.chunk_duration_ms = chunk_duration_ms
        self.device = device if device != "default" else None
        self.chunk_samples = int(sample_rate * chunk_duration_ms / 1000)
        self._queue: asyncio.Queue[bytes | None] = asyncio.Queue()
        self._running = False
        self._stream: sd.InputStream | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    def _audio_callback(self, indata: np.ndarray, frames: int, time_info, status):
        """Sounddevice callback: called from a separate thread for each audio block."""
        if status:
            logger.warning(f"Audio callback status: {status}")
        # Convert float32 [-1.0, 1.0] to PCM16 int16
        pcm16 = (indata[:, 0] * 32767).astype(np.int16)
        try:
            self._loop.call_soon_threadsafe(self._queue.put_nowait, pcm16.tobytes())
        except Exception:
            logger.debug("Audio callback: queue full or loop closed, dropping chunk")

    async def stream(self):
        """Async generator that yields base64-encoded PCM16 audio chunks.

        Each chunk contains chunk_duration_ms worth of audio.
        Yields strings ready to be sent as the 'audio' field of
        input_audio_buffer.append events.
        """
        self._loop = asyncio.get_running_loop()
        self._running = True

        try:
            self._stream = sd.InputStream(
                samplerate=self.sample_rate,
                channels=self.channels,
                dtype="float32",
                blocksize=self.chunk_samples,
                device=self.device,
                callback=self._audio_callback,
            )
            self._stream.start()
        except sd.PortAudioError as e:
            error_msg = str(e).lower()
            if (
                ("no" in error_msg and "device" in error_msg)
                or "error querying device" in error_msg
            ):
                raise AudioDeviceNotFoundError(
                    f"Audio input device not found (check that a microphone "
                    f"is connected): {e}"
                ) from e
            raise AudioDeviceError(f"Audio device error: {e}") from e

        logger.info(
            f"Audio capture started: {self.sample_rate}Hz, "
            f"{self.channels}ch, {self.chunk_duration_ms}ms chunks"
        )

        try:
            while self._running:
                raw_bytes = await self._queue.get()
                if raw_bytes is None:
                    break
                yield base64.b64encode(raw_bytes).decode("ascii")
        finally:
            self._stop_stream()

    def stop(self):
        """Signal the audio stream to stop."""
        self._running = False
        try:
            self._loop.call_soon_threadsafe(self._queue.put_nowait, None)
        except Exception:
            logger.debug("Stop signal: queue or loop unavailable")

    def _stop_stream(self):
        """Clean up the sounddevice stream."""
        if self._stream is not None:
            self._stream.stop()
            self._stream.close()
            self._stream = None
            logger.info("Audio capture stopped")

    @staticmethod
    def list_devices() -> list[dict]:
        """List available audio input devices."""
        devices = sd.query_devices()
        result = []
        for i, dev in enumerate(devices):
            if dev["max_input_channels"] > 0:
                result.append({
                    "index": i,
                    "name": dev["name"],
                    "channels": dev["max_input_channels"],
                    "sample_rate": dev["default_samplerate"],
                })
        return result
