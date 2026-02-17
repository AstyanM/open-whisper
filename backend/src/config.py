"""Configuration loading and validation using Pydantic.

Loads config.yaml from the project root and validates all fields
with sensible defaults. Falls back to defaults if config.yaml is missing.
"""

import logging
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


SUPPORTED_LANGUAGES = (
    "fr", "en", "es", "pt", "hi", "de", "nl", "it", "ar", "ru", "zh", "ja", "ko"
)


class ShortcutsConfig(BaseModel):
    toggle_dictation: str = "Ctrl+Shift+D"
    toggle_transcription: str = "Ctrl+Shift+T"


class TranscriptionModelConfig(BaseModel):
    model_size: str = "auto"
    device: Literal["cuda", "cpu", "auto"] = "auto"
    compute_type: Literal["float16", "float32", "int8", "int8_float16", "auto"] = "auto"
    beam_size: int = Field(default=5, ge=1, le=20)
    vad_filter: bool = True
    vad_min_silence_ms: int = Field(
        default=500,
        ge=100,
        le=3000,
        description="Minimum silence duration (ms) for VAD to split segments",
    )
    buffer_duration_s: float = Field(default=10.0, ge=1.0, le=30.0)
    initial_prompt: str | None = Field(
        default=None,
        description="Prompt to prime the model (e.g. French text to avoid code-switching)",
    )
    overlap_duration_s: float = Field(
        default=1.0,
        ge=0.0,
        le=5.0,
        description="Seconds of audio overlap between consecutive chunks",
    )
    temperature: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Decoding temperature (0 = deterministic greedy, faster)",
    )
    end_padding_ms: int = Field(
        default=300,
        ge=0,
        le=1000,
        description="Silence padding (ms) appended before transcription to avoid truncation",
    )
    post_roll_ms: int = Field(
        default=1200,
        ge=0,
        le=5000,
        description="Extra audio capture (ms) after stop to avoid cutting last words",
    )
    repetition_penalty: float = Field(
        default=1.15,
        ge=1.0,
        le=2.0,
        description="Penalizes repeated tokens to prevent hallucination loops (1.0 = disabled)",
    )
    no_repeat_ngram_size: int = Field(
        default=4,
        ge=0,
        le=10,
        description="Prevents repeating any N-gram of this size (0 = disabled)",
    )
    compression_ratio_threshold: float = Field(
        default=2.4,
        ge=0.0,
        le=10.0,
        description="Discard segments with compression ratio above this threshold (hallucination indicator)",
    )
    log_prob_threshold: float = Field(
        default=-1.0,
        ge=-5.0,
        le=0.0,
        description="Discard segments with average log probability below this threshold",
    )
    hallucination_max_repeats: int = Field(
        default=3,
        ge=2,
        le=10,
        description="Max times a phrase can repeat before the chunk is considered hallucinated",
    )



class LLMConfig(BaseModel):
    enabled: bool = Field(default=False, description="Enable LLM post-processing (summarize, rewrite)")
    api_url: str = Field(
        default="http://localhost:11434/v1",
        description="OpenAI-compatible API base URL (Ollama default)",
    )
    api_key: str = Field(
        default="ollama",
        description="API key ('ollama' for local Ollama, real key for cloud providers)",
    )
    model: str = Field(
        default="mistral:7b",
        description="Model name for LLM completions",
    )
    temperature: float = Field(default=0.3, ge=0.0, le=2.0)
    max_tokens: int = Field(default=512, ge=64, le=4096)
    auto_summarize: bool = Field(
        default=True,
        description="Automatically generate summary after each transcription session",
    )

class ModelsConfig(BaseModel):
    transcription: TranscriptionModelConfig = TranscriptionModelConfig()
    llm: LLMConfig = LLMConfig()


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
    enabled: bool = False
    position: Literal["top-left", "top-right", "bottom-left", "bottom-right"] = "top-right"
    opacity: float = Field(default=0.85, ge=0.1, le=1.0)
    size: Literal["small", "medium"] = "small"
    show_language: bool = True
    show_mode: bool = True
    show_duration: bool = True


class StorageConfig(BaseModel):
    db_path: str = "./data/sessions.db"


class BackendConfig(BaseModel):
    host: str = "127.0.0.1"
    port: int = Field(default=8001, ge=1, le=65535)


class SearchConfig(BaseModel):
    embedding_model: str = Field(
        default="paraphrase-multilingual-MiniLM-L12-v2",
        description="Sentence-transformers ONNX model for semantic search embeddings",
    )
    distance_threshold: float = Field(
        default=1.0,
        ge=0.0,
        le=2.0,
        description="Maximum cosine distance for search results (0=exact, 2=opposite). Results above this are filtered out.",
    )


class AppConfig(BaseModel):
    language: str = Field(default="en", description="Default transcription language")
    max_upload_size_mb: int = Field(
        default=500,
        ge=50,
        le=1024,
        description="Maximum file upload size in MB (50-1024)",
    )
    shortcuts: ShortcutsConfig = ShortcutsConfig()
    models: ModelsConfig = ModelsConfig()
    audio: AudioConfig = AudioConfig()
    overlay: OverlayConfig = OverlayConfig()
    search: SearchConfig = SearchConfig()
    storage: StorageConfig = StorageConfig()
    backend: BackendConfig = BackendConfig()


def find_config_path() -> Path | None:
    """Find config.yaml by walking up from backend/ to project root.

    Returns None if no config.yaml is found (instead of raising).
    """
    candidates = [
        Path(__file__).resolve().parent.parent.parent / "config.yaml",
        Path.cwd() / "config.yaml",
        Path.cwd().parent / "config.yaml",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def get_config_path() -> Path:
    """Return the path to config.yaml (existing or default location for creation)."""
    path = find_config_path()
    if path is not None:
        return path
    return Path(__file__).resolve().parent.parent.parent / "config.yaml"


def load_config(path: Path | None = None) -> AppConfig:
    """Load and validate configuration from config.yaml.

    Falls back to Pydantic defaults if config.yaml is missing.
    """
    if path is None:
        path = find_config_path()

    if path is None:
        logger.warning(
            "config.yaml not found. Using default configuration. "
            "Copy config.example.yaml to config.yaml to customize settings."
        )
        return AppConfig.model_validate({})

    with open(path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)

    if raw is None:
        raw = {}

    return AppConfig.model_validate(raw)
