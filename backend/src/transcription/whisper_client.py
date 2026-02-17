"""Faster-whisper transcription client (OpenAI Whisper via CTranslate2).

Replaces the vLLM/Voxtral integration with a lightweight, in-process
transcription engine. No external server required.

Audio chunks are accumulated in a buffer. Every `buffer_duration_s` seconds,
the buffer is transcribed via faster-whisper in a thread pool executor.
Text deltas are pushed to an asyncio.Queue for streaming consumption.
"""

import asyncio
import base64
import logging
import os
import sys
import time
from pathlib import Path
from typing import AsyncIterator

import numpy as np

# ── Windows: register NVIDIA pip-package DLL directories ──────────────
# cuBLAS/cuDNN DLLs installed via `pip install nvidia-cublas-cu12` live in
# .venv/Lib/site-packages/nvidia/*/bin/ which is NOT on the default DLL
# search path.  We must BOTH call os.add_dll_directory() AND prepend to PATH
# because CTranslate2 loads cuBLAS via mechanisms that only respect PATH.
if sys.platform == "win32":
    _nvidia_base = Path(sys.prefix) / "Lib" / "site-packages" / "nvidia"
    if _nvidia_base.exists():
        _extra_paths = []
        for _bin_dir in _nvidia_base.iterdir():
            _candidate = _bin_dir / "bin"
            if _candidate.is_dir():
                os.add_dll_directory(str(_candidate))
                _extra_paths.append(str(_candidate))
        if _extra_paths:
            os.environ["PATH"] = os.pathsep.join(_extra_paths) + os.pathsep + os.environ.get("PATH", "")

from faster_whisper import WhisperModel

from src.config import TranscriptionModelConfig
from src.exceptions import WhisperModelError

from src.debug_log import debug_log as _debug_log

logger = logging.getLogger(__name__)


def _debug(msg: str) -> None:
    """Convenience wrapper for debug_log with WHISPER tag."""
    _debug_log("WHISPER", msg)


# Module-level marker
_debug(f"===== whisper_client.py MODULE LOADED (pid={os.getpid()}) =====")

# Module-level model cache — loaded once, reused across sessions.
_model: WhisperModel | None = None
_model_config_key: str | None = None
_model_actual_device: str | None = None
_model_lock = asyncio.Lock()


def get_model_info() -> dict[str, str | None]:
    """Return info about the currently loaded model (for health checks)."""
    return {
        "actual_device": _model_actual_device,
        "loaded": _model is not None,
    }


def _get_or_load_model(config: TranscriptionModelConfig) -> WhisperModel:
    """Get the cached model or load a new one.

    If model_size is 'auto', selects large-v3-turbo for GPU or small for CPU.
    If device is 'auto' or 'cuda' and CUDA loading fails (e.g. missing cuBLAS),
    automatically falls back to CPU with float32.
    The CUDA check includes a real transcription test because cuBLAS errors
    can be deferred until actual inference (not caught at model creation time).
    """
    global _model, _model_config_key, _model_actual_device

    # Resolve "auto" model size based on available device
    model_size = config.model_size
    if model_size == "auto":
        _has_cuda = False
        try:
            import ctranslate2

            _has_cuda = "cuda" in ctranslate2.get_supported_compute_types("cuda")
        except Exception:
            pass
        if _has_cuda:
            model_size = "large-v3-turbo"
            _debug("[WHISPER] Auto model: CUDA available -> large-v3-turbo")
            logger.info("Auto model selection: CUDA available -> large-v3-turbo")
        else:
            model_size = "small"
            _debug("[WHISPER] Auto model: CPU only -> small")
            logger.info("Auto model selection: CPU only -> small")

    config_key = f"{model_size}:{config.device}:{config.compute_type}"
    if _model is not None and _model_config_key == config_key:
        _debug(f"[WHISPER] Reusing cached model (key={config_key})")
        logger.info("Reusing cached model (key=%s)", config_key)
        return _model

    _debug(f"[WHISPER] Loading model: {model_size} (device={config.device}, compute_type={config.compute_type})")
    logger.info(
        "Loading faster-whisper model: %s (device=%s, compute_type=%s)",
        model_size,
        config.device,
        config.compute_type,
    )
    t0 = time.monotonic()
    try:
        _model = WhisperModel(
            model_size,
            device=config.device,
            compute_type=config.compute_type,
        )
        # Detect the real device: ctranslate2 model exposes .device ("cuda"/"cpu")
        _model_actual_device = getattr(
            getattr(_model, "model", None), "device", config.device
        )

        # Validate that the model can actually run inference.
        # cuBLAS errors are deferred until real GPU work, so model creation
        # can succeed even without cuBLAS. A quick dummy transcription catches this.
        if config.device in ("auto", "cuda"):
            _debug("[WHISPER] Validating CUDA with dummy transcription...")
            _dummy_audio = np.zeros(16000, dtype=np.float32)  # 1s silence
            segments, _info = _model.transcribe(_dummy_audio, language="en", beam_size=1)
            # Force-consume the lazy generator to trigger actual CUDA work
            for _ in segments:
                pass
            _debug("[WHISPER] CUDA validation passed")

    except RuntimeError as e:
        if config.device in ("auto", "cuda") and "cublas" in str(e).lower():
            _debug(f"[WHISPER] CUDA failed ({e}), falling back to CPU")
            logger.warning(
                "CUDA loading failed (%s). Falling back to CPU with float32.", e
            )
            # If we auto-selected a large model for GPU, downgrade for CPU
            if config.model_size == "auto":
                model_size = "small"
                _debug("[WHISPER] Auto model: CUDA fallback -> downgrading to small")
                logger.info("Auto model: CUDA fallback -> downgrading to small")
            _model = WhisperModel(
                model_size,
                device="cpu",
                compute_type="float32",
            )
            _model_actual_device = "cpu (fallback)"
            config_key = f"{model_size}:cpu:float32"
        else:
            raise WhisperModelError(f"Failed to load Whisper model: {e}") from e
    except Exception as e:
        raise WhisperModelError(f"Failed to load Whisper model: {e}") from e

    elapsed = time.monotonic() - t0
    _model_config_key = config_key
    _debug(f"[WHISPER] Model loaded in {elapsed:.1f}s (device={_model_actual_device})")
    logger.info(
        "Faster-whisper model loaded in %.1fs (device=%s)",
        elapsed,
        _model_actual_device,
    )
    return _model


class WhisperSession:
    """A single transcription session using faster-whisper.

    Accumulates audio in a buffer, periodically transcribes it,
    and yields text deltas matching the protocol expected by ws.py.
    """

    def __init__(
        self,
        config: TranscriptionModelConfig,
        language: str | None = None,
        sample_rate: int = 16000,
    ):
        self._config = config
        self._language = language
        self._sample_rate = sample_rate
        self._audio_buffer = bytearray()
        self._delta_queue: asyncio.Queue[str | None] = asyncio.Queue()
        self._buffer_samples = int(sample_rate * config.buffer_duration_s)
        self._overlap_bytes = int(sample_rate * config.overlap_duration_s) * 2  # 2 bytes per int16
        self._end_of_audio = asyncio.Event()
        self._cancelled = False
        self._transcription_task: asyncio.Task | None = None
        self._model: WhisperModel | None = None
        self._previous_text: str = ""

    async def __aenter__(self) -> "WhisperSession":
        """Load model (if not cached) in a thread pool to avoid blocking."""
        _debug("[WHISPER] Session __aenter__: loading model...")
        logger.info("[Session] Loading model...")
        loop = asyncio.get_running_loop()
        try:
            async with _model_lock:
                self._model = await loop.run_in_executor(
                    None, _get_or_load_model, self._config
                )
        except WhisperModelError:
            raise
        except Exception as e:
            raise WhisperModelError(f"Failed to initialize Whisper: {e}") from e

        self.actual_device = _model_actual_device
        _debug(f"[WHISPER] Model ready (device={self.actual_device}). Starting worker.")
        logger.info("[Session] Model ready (device=%s). Starting worker.", self.actual_device)

        # Start background transcription worker
        self._transcription_task = asyncio.create_task(self._transcription_worker())
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Clean up the transcription worker."""
        _debug(f"[WHISPER] Session __aexit__ (exc_type={exc_type})")
        logger.info("[Session] Exiting session (exc_type=%s)", exc_type)
        self._cancelled = True
        self._end_of_audio.set()
        if self._transcription_task and not self._transcription_task.done():
            try:
                await asyncio.wait_for(self._transcription_task, timeout=30)
            except asyncio.TimeoutError:
                _debug("[WHISPER] Worker did not finish in 30s, cancelling")
                logger.warning("[Session] Worker did not finish in 30s, cancelling")
                self._transcription_task.cancel()
        self._audio_buffer.clear()
        _debug("[WHISPER] Session cleaned up")
        logger.info("[Session] Session cleaned up")

    async def send_audio(self, audio_base64: str) -> None:
        """Receive a base64-encoded PCM16 audio chunk and add to buffer."""
        pcm_bytes = base64.b64decode(audio_base64)
        self._audio_buffer.extend(pcm_bytes)

    async def signal_end_of_audio(self) -> None:
        """Signal that no more audio will be sent.

        If post_roll_ms > 0, waits that duration before signaling so the
        frontend can keep sending the last audio chunks (avoids cutting the
        user's last words).
        """
        post_roll_s = self._config.post_roll_ms / 1000.0
        _debug(f"[WHISPER] End of audio signaled (buffer={len(self._audio_buffer)} bytes, post_roll={post_roll_s:.1f}s)")
        logger.info(
            "[Session] End of audio signaled (buffer=%d bytes, post_roll=%.1fs)",
            len(self._audio_buffer),
            post_roll_s,
        )
        if post_roll_s > 0:
            await asyncio.sleep(post_roll_s)
        self._end_of_audio.set()

    async def stream_transcription(self) -> AsyncIterator[str]:
        """Yield text deltas as transcription results become available."""
        while True:
            delta = await self._delta_queue.get()
            if delta is None:  # Sentinel: transcription complete
                _debug("[WHISPER] Stream ended (received sentinel)")
                logger.info("[Session] Stream ended (received sentinel)")
                return
            _debug(f"[WHISPER] Delta: {repr(delta[:80])}")
            logger.info("[Session] Delta: %s", repr(delta[:80]))
            yield delta

    # ── Internal ──────────────────────────────────────────────────────

    async def _transcription_worker(self):
        """Background task: periodically transcribe accumulated audio."""
        loop = asyncio.get_running_loop()
        buffer_byte_threshold = self._buffer_samples * 2  # 2 bytes per int16 sample
        chunk_count = 0

        _debug(f"[WHISPER] Worker started (threshold={buffer_byte_threshold} bytes, ~{self._config.buffer_duration_s:.1f}s)")
        logger.info(
            "[Worker] Started (buffer_threshold=%d bytes, ~%.1fs of audio)",
            buffer_byte_threshold,
            self._config.buffer_duration_s,
        )

        try:
            while True:
                # Check cancellation
                if self._cancelled:
                    _debug("[WHISPER] Worker cancelled, exiting")
                    break

                # Wait until we have enough audio or end-of-audio is signaled
                while (
                    len(self._audio_buffer) < buffer_byte_threshold
                    and not self._end_of_audio.is_set()
                    and not self._cancelled
                ):
                    await asyncio.sleep(0.1)

                if self._cancelled:
                    _debug("[WHISPER] Worker cancelled during wait, exiting")
                    break

                if len(self._audio_buffer) == 0:
                    _debug("[WHISPER] No audio in buffer, exiting")
                    logger.info("[Worker] No audio in buffer, exiting")
                    break

                # Extract audio to transcribe, keeping overlap for next chunk
                audio_bytes = bytes(self._audio_buffer)
                if self._overlap_bytes > 0 and not self._end_of_audio.is_set():
                    # Keep the last overlap_duration_s of audio for context
                    keep = min(self._overlap_bytes, len(self._audio_buffer))
                    self._audio_buffer = bytearray(self._audio_buffer[-keep:])
                else:
                    self._audio_buffer.clear()
                duration_s = len(audio_bytes) / 2 / self._sample_rate

                _debug(f"[WHISPER] Transcribing chunk #{chunk_count}: {len(audio_bytes)} bytes ({duration_s:.1f}s audio)")
                logger.info(
                    "[Worker] Transcribing chunk #%d: %d bytes (%.1fs audio)",
                    chunk_count,
                    len(audio_bytes),
                    duration_s,
                )

                # Convert PCM16 int16 -> float32 for faster-whisper
                audio_np = (
                    np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32)
                    / 32768.0
                )

                # Run transcription in thread pool with timeout
                t0 = time.monotonic()
                try:
                    text = await asyncio.wait_for(
                        loop.run_in_executor(
                            None, self._transcribe_chunk, audio_np
                        ),
                        timeout=60,
                    )
                except asyncio.TimeoutError:
                    _debug(f"[WHISPER] Chunk #{chunk_count} TIMED OUT after 60s, skipping")
                    logger.warning("[Worker] Transcription timed out after 60s, skipping chunk #%d", chunk_count)
                    text = ""

                elapsed = time.monotonic() - t0
                chunk_count += 1

                _debug(f"[WHISPER] Chunk #{chunk_count - 1} done in {elapsed:.2f}s: {repr(text[:100]) if text else '(empty)'}")
                logger.info(
                    "[Worker] Chunk #%d transcribed in %.2fs: %s",
                    chunk_count - 1,
                    elapsed,
                    repr(text[:100]) if text else "(empty)",
                )

                if text.strip():
                    # Check for hallucination before accepting the text
                    if self._is_hallucinated(text, self._config.hallucination_max_repeats):
                        _debug(f"[WHISPER] Chunk #{chunk_count - 1} discarded (hallucination)")
                        logger.warning(
                            "[Worker] Chunk #%d discarded: hallucination detected",
                            chunk_count - 1,
                        )
                        # Reset previous text to break the hallucination chain
                        self._previous_text = ""
                    else:
                        await self._delta_queue.put(text)
                        self._previous_text = text.strip()

                if self._end_of_audio.is_set() and len(self._audio_buffer) == 0:
                    _debug("[WHISPER] End of audio reached, no more data, exiting worker")
                    logger.info("[Worker] End of audio reached, no more data, exiting")
                    break

        except Exception as e:
            _debug(f"[WHISPER] Worker ERROR: {e}")
            logger.error("[Worker] Error: %s", e, exc_info=True)
        finally:
            _debug("[WHISPER] Worker sending sentinel to stream")
            logger.info("[Worker] Sending sentinel to stream")
            await self._delta_queue.put(None)  # Signal completion

    @staticmethod
    def _is_hallucinated(text: str, max_repeats: int = 3) -> bool:
        """Detect if text contains repetitive hallucination patterns.

        Checks for any phrase (3+ words) that repeats more than max_repeats
        times consecutively. This is a reliable sign of Whisper hallucination.
        """
        if not text or len(text) < 30:
            return False
        words = text.split()
        if len(words) < 6:
            return False
        # Check n-grams of size 3 to 6
        for ngram_size in range(3, min(7, len(words) // 2 + 1)):
            for start in range(len(words) - ngram_size + 1):
                ngram = " ".join(words[start : start + ngram_size])
                count = 0
                i = start
                while i + ngram_size <= len(words):
                    candidate = " ".join(words[i : i + ngram_size])
                    if candidate == ngram:
                        count += 1
                        i += ngram_size
                    else:
                        break
                if count > max_repeats:
                    _debug(f"[WHISPER] Hallucination detected: '{ngram}' repeated {count}x")
                    logger.warning(
                        "[Transcribe] Hallucination detected: '%s' repeated %dx",
                        ngram, count,
                    )
                    return True
        return False

    def _transcribe_chunk(self, audio: np.ndarray) -> str:
        """Run faster-whisper transcription on a float32 audio array. Sync."""
        # Append silence padding to avoid Whisper truncating last words
        if self._config.end_padding_ms > 0:
            pad_samples = int(self._sample_rate * self._config.end_padding_ms / 1000)
            audio = np.concatenate([audio, np.zeros(pad_samples, dtype=np.float32)])

        # Build prompt: previous text takes priority, then config initial_prompt
        prompt = self._previous_text or self._config.initial_prompt or None
        # Truncate to last ~200 chars to stay within Whisper's prompt token limit
        if prompt and len(prompt) > 200:
            prompt = prompt[-200:]

        # VAD parameters
        vad_params = (
            {"min_silence_duration_ms": self._config.vad_min_silence_ms}
            if self._config.vad_filter
            else None
        )

        _debug(f"[WHISPER] _transcribe_chunk: {len(audio)/self._sample_rate:.1f}s audio, lang={self._language}, beam={self._config.beam_size}, vad={self._config.vad_filter}, temp={self._config.temperature}, prompt={repr(prompt[:60]) if prompt else None}")
        logger.info(
            "[Transcribe] Starting (%.1fs audio, lang=%s, beam=%d, vad=%s, temp=%.1f, prompt=%s)",
            len(audio) / self._sample_rate,
            self._language,
            self._config.beam_size,
            self._config.vad_filter,
            self._config.temperature,
            repr(prompt[:60]) if prompt else None,
        )
        segments, _info = self._model.transcribe(
            audio,
            language=self._language,
            beam_size=self._config.beam_size,
            vad_filter=self._config.vad_filter,
            vad_parameters=vad_params,
            initial_prompt=prompt,
            temperature=self._config.temperature,
            condition_on_previous_text=False,
            repetition_penalty=self._config.repetition_penalty,
            no_repeat_ngram_size=self._config.no_repeat_ngram_size,
        )
        # Force-consume the generator with per-segment quality filtering
        compression_threshold = self._config.compression_ratio_threshold
        logprob_threshold = self._config.log_prob_threshold
        result_parts = []
        for seg in segments:
            text = seg.text.strip()
            if not text:
                continue
            # Filter out low-quality segments (hallucination indicators)
            if hasattr(seg, "compression_ratio") and seg.compression_ratio > compression_threshold:
                _debug(f"[WHISPER] Skipping segment (compression_ratio={seg.compression_ratio:.2f} > {compression_threshold}): {repr(text[:60])}")
                logger.warning(
                    "[Transcribe] Skipping segment (compression_ratio=%.2f > %.1f): %s",
                    seg.compression_ratio, compression_threshold, repr(text[:60]),
                )
                continue
            if hasattr(seg, "avg_logprob") and seg.avg_logprob < logprob_threshold:
                _debug(f"[WHISPER] Skipping segment (avg_logprob={seg.avg_logprob:.2f} < {logprob_threshold}): {repr(text[:60])}")
                logger.warning(
                    "[Transcribe] Skipping segment (avg_logprob=%.2f < %.1f): %s",
                    seg.avg_logprob, logprob_threshold, repr(text[:60]),
                )
                continue
            result_parts.append(text)
            _debug(f"[WHISPER] Segment: {repr(text)}")
            logger.info("[Transcribe] Segment: %s", repr(text))
        result = " ".join(result_parts)
        _debug(f"[WHISPER] _transcribe_chunk done: {repr(result[:100]) if result else '(empty)'}")
        logger.info("[Transcribe] Done: %s", repr(result[:100]) if result else "(empty)")
        return result


class WhisperClient:
    """Client that creates WhisperSession instances.

    Usage:
        client = WhisperClient(config=..., sample_rate=16000)
        async with client.connect(language="fr") as session:
            await session.send_audio(audio_b64)
            ...
            async for delta in session.stream_transcription():
                print(delta)
    """

    def __init__(self, config: TranscriptionModelConfig, sample_rate: int = 16000):
        self._config = config
        self._sample_rate = sample_rate

    def connect(self, language: str | None = None) -> WhisperSession:
        """Create a new transcription session."""
        return WhisperSession(
            config=self._config,
            language=language,
            sample_rate=self._sample_rate,
        )
