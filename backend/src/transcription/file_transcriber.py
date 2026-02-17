"""File transcription using faster-whisper's native file handling.

Transcribes an audio file and yields segments with real timestamps as they
are produced. Uses the same model cache as the live transcription
(whisper_client._get_or_load_model).
"""

import asyncio
import logging
from pathlib import Path
from typing import AsyncIterator, NamedTuple

from src.config import TranscriptionModelConfig
from src.transcription.whisper_client import _get_or_load_model, _debug, _model_lock

logger = logging.getLogger(__name__)


class TranscriptionSegment(NamedTuple):
    text: str
    start_ms: int
    end_ms: int
    confidence: float  # avg_logprob as proxy


async def transcribe_file_streaming(
    file_path: Path,
    config: TranscriptionModelConfig,
    language: str | None = None,
) -> tuple[float, AsyncIterator[TranscriptionSegment]]:
    """Transcribe an audio file, streaming segments as they are produced.

    Returns (audio_duration_s, async_segment_iterator).

    Uses faster-whisper's native file handling (ffmpeg-based decoding) so
    it accepts WAV, MP3, FLAC, OGG, M4A, WebM, etc.
    """
    loop = asyncio.get_running_loop()

    _debug(f"[FILE] Loading model for file transcription: {file_path.name}")
    async with _model_lock:
        model = await loop.run_in_executor(None, _get_or_load_model, config)

    queue: asyncio.Queue[TranscriptionSegment | None] = asyncio.Queue()
    audio_duration_holder: list[float] = [0.0]
    error_holder: list[Exception | None] = [None]
    ready_event = asyncio.Event()

    compression_threshold = config.compression_ratio_threshold
    logprob_threshold = config.log_prob_threshold

    vad_params = (
        {"min_silence_duration_ms": config.vad_min_silence_ms}
        if config.vad_filter
        else None
    )

    def _transcribe_to_queue():
        """Blocking: consume the lazy segment generator in a thread."""
        try:
            _debug(f"[FILE] Starting transcription of {file_path.name} (lang={language})")
            segments_gen, info = model.transcribe(
                str(file_path),
                language=language,
                beam_size=config.beam_size,
                vad_filter=config.vad_filter,
                vad_parameters=vad_params,
                initial_prompt=config.initial_prompt,
                temperature=config.temperature,
                condition_on_previous_text=True,
                repetition_penalty=config.repetition_penalty,
                no_repeat_ngram_size=config.no_repeat_ngram_size,
            )

            audio_duration_holder[0] = info.duration
            _debug(f"[FILE] Audio duration: {info.duration:.1f}s")
            # Signal that audio_duration is available
            loop.call_soon_threadsafe(ready_event.set)

            for seg in segments_gen:
                text = seg.text.strip()
                if not text:
                    continue

                # Quality filtering (same as WhisperSession._transcribe_chunk)
                if hasattr(seg, "compression_ratio") and seg.compression_ratio > compression_threshold:
                    _debug(f"[FILE] Skip segment (compression_ratio={seg.compression_ratio:.2f}): {repr(text[:60])}")
                    continue
                if hasattr(seg, "avg_logprob") and seg.avg_logprob < logprob_threshold:
                    _debug(f"[FILE] Skip segment (avg_logprob={seg.avg_logprob:.2f}): {repr(text[:60])}")
                    continue

                confidence = getattr(seg, "avg_logprob", 0.0)
                ts = TranscriptionSegment(
                    text=text,
                    start_ms=int(seg.start * 1000),
                    end_ms=int(seg.end * 1000),
                    confidence=confidence,
                )
                loop.call_soon_threadsafe(queue.put_nowait, ts)
                _debug(f"[FILE] Segment [{seg.start:.1f}s-{seg.end:.1f}s]: {repr(text[:80])}")

        except Exception as e:
            _debug(f"[FILE] Transcription error: {e}")
            logger.error("[FILE] Transcription error: %s", e, exc_info=True)
            error_holder[0] = e
            # Ensure the ready event is set so the caller doesn't block forever
            loop.call_soon_threadsafe(ready_event.set)
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)  # sentinel
            _debug("[FILE] Transcription thread finished")

    # Start the blocking transcription in a thread
    task = loop.run_in_executor(None, _transcribe_to_queue)

    # Wait for audio_duration to be available
    await ready_event.wait()

    if error_holder[0] is not None:
        await task
        raise error_holder[0]

    async def _segment_stream() -> AsyncIterator[TranscriptionSegment]:
        try:
            while True:
                seg = await queue.get()
                if seg is None:
                    break
                yield seg
        finally:
            # Ensure the thread finishes
            await task

    return audio_duration_holder[0], _segment_stream()
