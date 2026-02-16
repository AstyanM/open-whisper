"""Configuration loading and validation using Pydantic.

Loads config.yaml from the project root and validates all fields
with sensible defaults.
"""

from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field


SUPPORTED_LANGUAGES = (
    "fr", "en", "es", "pt", "hi", "de", "nl", "it", "ar", "ru", "zh", "ja", "ko"
)


class ShortcutsConfig(BaseModel):
    toggle_dictation: str = "Ctrl+Shift+D"
    toggle_transcription: str = "Ctrl+Shift+T"


class TranscriptionModelConfig(BaseModel):
    model_size: str = "small"
    device: Literal["cuda", "cpu", "auto"] = "auto"
    compute_type: Literal["float16", "float32", "int8", "int8_float16", "auto"] = "auto"
    beam_size: int = Field(default=5, ge=1, le=20)
    vad_filter: bool = True
    buffer_duration_s: float = Field(default=3.0, ge=1.0, le=10.0)


class ModelsConfig(BaseModel):
    transcription: TranscriptionModelConfig = TranscriptionModelConfig()


class AudioConfig(BaseModel):
    sample_rate: int = Field(default=16000, description="Sample rate in Hz")
    channels: int = Field(default=1, ge=1, le=2)
    device: str = "default"
    chunk_duration_ms: int = Field(
        default=80,
        ge=20,
        le=500,
        description="Duration of each audio chunk in ms.",
    )


class OverlayConfig(BaseModel):
    enabled: bool = True
    position: Literal["top-left", "top-right", "bottom-left", "bottom-right"] = "top-right"
    opacity: float = Field(default=0.85, ge=0.1, le=1.0)
    size: Literal["small", "medium"] = "small"
    show_language: bool = True
    show_mode: bool = False
    show_duration: bool = False


class StorageConfig(BaseModel):
    db_path: str = "./data/sessions.db"


class BackendConfig(BaseModel):
    host: str = "127.0.0.1"
    port: int = Field(default=8001, ge=1, le=65535)


class AppConfig(BaseModel):
    language: str = Field(default="fr", description="Default transcription language")
    shortcuts: ShortcutsConfig = ShortcutsConfig()
    models: ModelsConfig = ModelsConfig()
    audio: AudioConfig = AudioConfig()
    overlay: OverlayConfig = OverlayConfig()
    storage: StorageConfig = StorageConfig()
    backend: BackendConfig = BackendConfig()


def find_config_path() -> Path:
    """Find config.yaml by walking up from backend/ to project root."""
    candidates = [
        Path(__file__).resolve().parent.parent.parent / "config.yaml",
        Path.cwd() / "config.yaml",
        Path.cwd().parent / "config.yaml",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        "config.yaml not found. Expected at project root. "
        "Copy config.example.yaml to config.yaml and adjust settings."
    )


def load_config(path: Path | None = None) -> AppConfig:
    """Load and validate configuration from config.yaml."""
    if path is None:
        path = find_config_path()

    with open(path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)

    if raw is None:
        raw = {}

    return AppConfig.model_validate(raw)
