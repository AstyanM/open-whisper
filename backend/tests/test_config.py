"""Tests for configuration loading and validation."""

import pytest
from src.config import load_config, AppConfig


def test_load_default_config():
    """Test that config.yaml loads correctly from project root."""
    config = load_config()
    assert isinstance(config, AppConfig)
    assert config.language in (
        "fr", "en", "es", "pt", "hi", "de", "nl", "it", "ar", "ru", "zh", "ja", "ko"
    )
    assert config.audio.sample_rate == 16000
    assert config.audio.channels == 1
    assert config.backend.port == 8001


def test_config_defaults():
    """Test that defaults are applied when fields are missing."""
    config = AppConfig.model_validate({})
    assert config.language == "fr"
    assert config.models.transcription.delay_ms == 480
    assert config.audio.chunk_duration_ms == 80
    assert config.backend.host == "127.0.0.1"
    assert config.overlay.position == "top-right"


def test_config_validation_delay_range():
    """Test that delay_ms validation enforces range."""
    with pytest.raises(Exception):
        AppConfig.model_validate({
            "models": {"transcription": {"delay_ms": 10}}
        })

    with pytest.raises(Exception):
        AppConfig.model_validate({
            "models": {"transcription": {"delay_ms": 3000}}
        })


def test_config_custom_values():
    """Test that custom values are correctly loaded."""
    config = AppConfig.model_validate({
        "language": "en",
        "audio": {"sample_rate": 16000, "chunk_duration_ms": 160},
        "backend": {"port": 9000},
    })
    assert config.language == "en"
    assert config.audio.chunk_duration_ms == 160
    assert config.backend.port == 9000
