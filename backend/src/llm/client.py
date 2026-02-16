"""LLM client for summarization and text rewriting (OpenAI-compatible API).

Works with any provider exposing /v1/chat/completions:
Ollama (default), LM Studio, vLLM, OpenAI, etc.
"""

import logging
from typing import Any

from openai import AsyncOpenAI

from src.config import LLMConfig
from src.exceptions import LLMError

logger = logging.getLogger(__name__)

# ── Singleton state ──────────────────────────────────────────────────

_client: Any = None  # AsyncOpenAI | None
_config: LLMConfig | None = None

# ── Prompts ──────────────────────────────────────────────────────────

SUMMARIZE_SYSTEM = (
    "You are a concise summarizer. Given a voice transcription, produce a clear "
    "summary in 2-4 sentences. Preserve the original language of the transcription. "
    "Focus on the key topics and main points discussed. Do not add information "
    "that is not in the original text."
)

SUMMARIZE_USER = "Summarize the following transcription:\n\n{text}"

REWRITE_SYSTEM = (
    "You are a text editor. Rewrite the following voice transcription to be cleaner "
    "and more readable, fixing grammar and removing filler words. Preserve the original "
    "language and meaning. Do not add information that is not in the original text."
)

REWRITE_USER = "Rewrite the following text:\n\n{text}"

# ── Scenario prompts ─────────────────────────────────────────────────

SCENARIO_PROMPTS: dict[str, str] = {
    "summarize": (
        "You are a concise summarizer. Given a voice transcription, produce a clear "
        "summary in 2-4 sentences. Focus on the key topics and main points discussed. "
        "Do not add information that is not in the original text. "
        "You MUST respond in {language}."
    ),
    "todo_list": (
        "You are a task extraction assistant. Extract all actionable items from the "
        "following voice transcription and format them as a structured to-do list. "
        "Use markdown checkbox format (- [ ] task). Group related items if applicable. "
        "Only include tasks that are explicitly or implicitly mentioned in the text. "
        "Do not add tasks that are not in the original text. "
        "You MUST respond in {language}."
    ),
    "reformulate": (
        "You are a text editor. Rewrite this voice transcription to be cleaner and more "
        "readable. Remove filler words (um, uh, like, you know), fix grammar errors, "
        "remove repetitions and false starts, and clean up transcription artifacts. "
        "Preserve the original meaning and all information. Do not add content. "
        "You MUST respond in {language}."
    ),
}

SCENARIO_USER = "Process the following transcription:\n\n{text}"

_LANGUAGE_NAMES: dict[str, str] = {
    "fr": "French", "en": "English", "es": "Spanish", "de": "German",
    "it": "Italian", "pt": "Portuguese", "nl": "Dutch", "pl": "Polish",
    "ru": "Russian", "zh": "Chinese", "ja": "Japanese", "ko": "Korean",
    "ar": "Arabic",
}


# ── Lifecycle ────────────────────────────────────────────────────────

def init_llm_client(config: LLMConfig) -> None:
    """Initialize the OpenAI-compatible async client."""
    global _client, _config
    if not config.enabled:
        logger.info("LLM post-processing is disabled")
        _client = None
        _config = None
        return
    _config = config
    _client = AsyncOpenAI(
        base_url=config.api_url,
        api_key=config.api_key,
    )
    logger.info("LLM client initialized: %s / %s", config.api_url, config.model)


def close_llm_client() -> None:
    """Clean up the LLM client."""
    global _client, _config
    _client = None
    _config = None


def is_llm_available() -> bool:
    """Check if LLM client is initialized and enabled."""
    return _client is not None and _config is not None


def get_llm_config() -> LLMConfig | None:
    """Return current LLM config."""
    return _config


# ── Core operations ─────────────────────────────────────────────────

async def _chat_completion(system_prompt: str, user_prompt: str) -> str:
    """Send a chat completion request. Raises LLMError on failure."""
    if _client is None or _config is None:
        raise LLMError("LLM client not initialized or disabled")
    try:
        response = await _client.chat.completions.create(
            model=_config.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=_config.temperature,
            max_tokens=_config.max_tokens,
        )
        content = response.choices[0].message.content
        return content.strip() if content else ""
    except LLMError:
        raise
    except Exception as e:
        raise LLMError(f"LLM request failed: {e}") from e


async def summarize_text(text: str) -> str:
    """Generate a summary of the given transcription text."""
    if not text.strip():
        return ""
    return await _chat_completion(
        SUMMARIZE_SYSTEM,
        SUMMARIZE_USER.format(text=text),
    )


async def rewrite_text(text: str, instruction: str | None = None) -> str:
    """Rewrite/clean up the given text. Optional custom instruction."""
    if not text.strip():
        return ""
    system = instruction if instruction else REWRITE_SYSTEM
    return await _chat_completion(
        system,
        REWRITE_USER.format(text=text),
    )


async def process_text(text: str, scenario: str, language: str) -> str:
    """Process transcription text with a scenario-specific LLM prompt.

    Args:
        text: The transcription text to process.
        scenario: One of "summarize", "todo_list", "reformulate".
        language: ISO 639-1 language code (e.g. "fr", "en").

    Raises:
        ValueError: If scenario is unknown.
        LLMError: If LLM client is not available or request fails.
    """
    if not text.strip():
        return ""
    if scenario not in SCENARIO_PROMPTS:
        raise ValueError(
            f"Unknown scenario: {scenario}. "
            f"Must be one of: {', '.join(SCENARIO_PROMPTS)}"
        )
    lang_name = _LANGUAGE_NAMES.get(language, language)
    system_prompt = SCENARIO_PROMPTS[scenario].format(language=lang_name)
    return await _chat_completion(system_prompt, SCENARIO_USER.format(text=text))
