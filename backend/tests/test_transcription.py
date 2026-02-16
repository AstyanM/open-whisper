"""Tests for faster-whisper transcription client."""

import asyncio
import base64
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from src.config import TranscriptionModelConfig
from src.transcription.whisper_client import WhisperClient, WhisperSession


@pytest.fixture
def fw_config():
    """Config with short buffer for fast tests."""
    return TranscriptionModelConfig(
        model_size="tiny",
        device="cpu",
        compute_type="float32",
        buffer_duration_s=1.0,
        beam_size=1,
        vad_filter=False,
        post_roll_ms=0,
    )


def make_audio_chunk(duration_ms: int = 80, sample_rate: int = 16000) -> str:
    """Generate a silent PCM16 audio chunk as base64."""
    n_samples = int(sample_rate * duration_ms / 1000)
    pcm = np.zeros(n_samples, dtype=np.int16)
    return base64.b64encode(pcm.tobytes()).decode("ascii")


def make_mock_segment(text: str) -> MagicMock:
    """Create a mock segment with realistic quality metrics."""
    seg = MagicMock()
    seg.text = text
    seg.compression_ratio = 1.5
    seg.avg_logprob = -0.3
    return seg


@pytest.mark.asyncio
async def test_session_lifecycle(fw_config):
    """Session can be created, receive audio, and produce transcription."""
    mock_model = MagicMock()
    mock_segment = make_mock_segment("Hello world")
    mock_model.transcribe.return_value = ([mock_segment], MagicMock())

    with patch(
        "src.transcription.whisper_client._get_or_load_model",
        return_value=mock_model,
    ):
        client = WhisperClient(config=fw_config, sample_rate=16000)
        async with client.connect(language="en") as session:
            # Send enough audio to trigger transcription (> buffer_duration_s)
            for _ in range(100):
                await session.send_audio(make_audio_chunk())
            await session.signal_end_of_audio()

            deltas = []
            async for delta in session.stream_transcription():
                deltas.append(delta)

    assert len(deltas) > 0
    assert "Hello world" in " ".join(deltas)
    mock_model.transcribe.assert_called()


@pytest.mark.asyncio
async def test_empty_audio_yields_nothing(fw_config):
    """No audio should produce no transcription deltas."""
    mock_model = MagicMock()
    mock_model.transcribe.return_value = ([], MagicMock())

    with patch(
        "src.transcription.whisper_client._get_or_load_model",
        return_value=mock_model,
    ):
        client = WhisperClient(config=fw_config, sample_rate=16000)
        async with client.connect(language="en") as session:
            await session.signal_end_of_audio()
            deltas = []
            async for delta in session.stream_transcription():
                deltas.append(delta)

    assert deltas == []


@pytest.mark.asyncio
async def test_signal_end_flushes_remaining_buffer(fw_config):
    """signal_end_of_audio should cause any remaining buffered audio to be transcribed."""
    mock_model = MagicMock()
    mock_segment = make_mock_segment("Final chunk")
    mock_model.transcribe.return_value = ([mock_segment], MagicMock())

    with patch(
        "src.transcription.whisper_client._get_or_load_model",
        return_value=mock_model,
    ):
        client = WhisperClient(config=fw_config, sample_rate=16000)
        async with client.connect(language="fr") as session:
            # Send just a tiny bit of audio (less than buffer threshold)
            await session.send_audio(make_audio_chunk(duration_ms=80))
            await session.signal_end_of_audio()

            deltas = []
            async for delta in session.stream_transcription():
                deltas.append(delta)

    assert len(deltas) > 0
    assert "Final chunk" in " ".join(deltas)


@pytest.mark.asyncio
async def test_send_audio_accumulates_buffer(fw_config):
    """send_audio should accumulate PCM bytes in the internal buffer."""
    mock_model = MagicMock()
    mock_model.transcribe.return_value = ([], MagicMock())

    with patch(
        "src.transcription.whisper_client._get_or_load_model",
        return_value=mock_model,
    ):
        client = WhisperClient(config=fw_config, sample_rate=16000)
        async with client.connect(language="en") as session:
            chunk = make_audio_chunk(duration_ms=80)
            await session.send_audio(chunk)
            await session.send_audio(chunk)

            # Buffer should have 2 chunks worth of data
            expected_bytes = 2 * 1280 * 2  # 2 chunks * 1280 samples * 2 bytes/sample
            assert len(session._audio_buffer) == expected_bytes

            await session.signal_end_of_audio()
            # Drain the stream
            async for _ in session.stream_transcription():
                pass


@pytest.mark.asyncio
async def test_transcribe_called_with_correct_params(fw_config):
    """Transcribe should be called with the correct language and settings."""
    mock_model = MagicMock()
    mock_segment = make_mock_segment("Test")
    mock_model.transcribe.return_value = ([mock_segment], MagicMock())

    with patch(
        "src.transcription.whisper_client._get_or_load_model",
        return_value=mock_model,
    ):
        client = WhisperClient(config=fw_config, sample_rate=16000)
        async with client.connect(language="fr") as session:
            await session.send_audio(make_audio_chunk(duration_ms=80))
            await session.signal_end_of_audio()
            async for _ in session.stream_transcription():
                pass

    # Verify transcribe was called with correct kwargs
    call_kwargs = mock_model.transcribe.call_args[1]
    assert call_kwargs["language"] == "fr"
    assert call_kwargs["beam_size"] == 1
    assert call_kwargs["vad_filter"] is False
