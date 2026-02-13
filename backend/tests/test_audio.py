"""Tests for audio capture with mocked sounddevice."""

import asyncio
import base64

import pytest
import numpy as np
from unittest.mock import patch, MagicMock

from src.audio.capture import AudioCapture
from src.exceptions import AudioDeviceNotFoundError, AudioDeviceError


@pytest.mark.asyncio
async def test_stream_yields_base64_chunks():
    """Test that stream produces valid base64-encoded audio chunks."""
    capture = AudioCapture(sample_rate=16000, channels=1, chunk_duration_ms=80)

    mock_stream = MagicMock()
    mock_stream.start = MagicMock()
    mock_stream.stop = MagicMock()
    mock_stream.close = MagicMock()

    with patch("src.audio.capture.sd.InputStream", return_value=mock_stream):
        chunks = []

        async def collect():
            async for chunk in capture.stream():
                chunks.append(chunk)
                if len(chunks) >= 3:
                    capture.stop()

        async def feed():
            await asyncio.sleep(0.05)
            for _ in range(3):
                fake_audio = np.random.randn(1280, 1).astype(np.float32)
                capture._audio_callback(fake_audio, 1280, None, None)
                await asyncio.sleep(0.01)

        await asyncio.gather(collect(), feed())

    assert len(chunks) == 3
    for c in chunks:
        decoded = base64.b64decode(c)
        assert len(decoded) > 0


@pytest.mark.asyncio
async def test_stream_raises_on_no_device():
    """Test that missing device raises AudioDeviceNotFoundError."""
    import sounddevice as sd

    capture = AudioCapture(device=999)

    with patch(
        "src.audio.capture.sd.InputStream",
        side_effect=sd.PortAudioError("No default input device"),
    ):
        with pytest.raises(AudioDeviceNotFoundError):
            async for _ in capture.stream():
                pass


@pytest.mark.asyncio
async def test_stream_raises_generic_device_error():
    """Test that generic PortAudio errors raise AudioDeviceError."""
    import sounddevice as sd

    capture = AudioCapture()

    with patch(
        "src.audio.capture.sd.InputStream",
        side_effect=sd.PortAudioError("Sample rate not supported"),
    ):
        with pytest.raises(AudioDeviceError):
            async for _ in capture.stream():
                pass


def test_list_devices():
    """Test device listing returns only input devices."""
    with patch(
        "src.audio.capture.sd.query_devices",
        return_value=[
            {"name": "Test Mic", "max_input_channels": 2, "default_samplerate": 44100.0},
            {"name": "Speaker", "max_input_channels": 0, "default_samplerate": 44100.0},
        ],
    ):
        devices = AudioCapture.list_devices()
        assert len(devices) == 1
        assert devices[0]["name"] == "Test Mic"


def test_list_devices_empty():
    """Test device listing with no input devices."""
    with patch(
        "src.audio.capture.sd.query_devices",
        return_value=[
            {"name": "Speaker", "max_input_channels": 0, "default_samplerate": 44100.0},
        ],
    ):
        devices = AudioCapture.list_devices()
        assert len(devices) == 0
