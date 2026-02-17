"""Configuration GET/PUT endpoints with hot-reload support."""

import logging

import yaml
from fastapi import APIRouter, HTTPException, Request

from src.config import AppConfig, get_config_path

logger = logging.getLogger(__name__)

router = APIRouter()

# Fields that take effect immediately without restart
_HOT_RELOAD_PREFIXES = (
    "language",
    "overlay",
    "models.transcription.beam_size",
    "models.transcription.vad_filter",
    "models.transcription.buffer_duration_s",
    "models.transcription.model_size",
    "models.transcription.device",
    "models.transcription.compute_type",
    "models.llm",
    "search.distance_threshold",
)
# Fields that require an application restart
_RESTART_REQUIRED_PREFIXES = (
    "audio.device",
    "audio.chunk_duration_ms",
    "backend.",
    "storage.",
)


def _deep_merge(base: dict, override: dict) -> dict:
    """Deep merge *override* into *base*, returning a new dict."""
    result = base.copy()
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def _find_changed_paths(old: dict, new: dict, prefix: str = "") -> list[str]:
    """Return dot-separated paths whose values differ between *old* and *new*."""
    changed: list[str] = []
    for key in set(old.keys()) | set(new.keys()):
        path = f"{prefix}.{key}" if prefix else key
        old_val = old.get(key)
        new_val = new.get(key)
        if isinstance(old_val, dict) and isinstance(new_val, dict):
            changed.extend(_find_changed_paths(old_val, new_val, path))
        elif old_val != new_val:
            changed.append(path)
    return changed


@router.get("/api/config")
async def get_config():
    """Return full application configuration."""
    from src.main import config

    if config is None:
        raise HTTPException(status_code=503, detail="Configuration not loaded")
    return config.model_dump()


@router.put("/api/config")
async def update_config(request: Request):
    """Validate, persist, and hot-reload configuration changes.

    Accepts a partial JSON body.  Fields are deep-merged with the current
    config, validated through Pydantic, written to ``config.yaml``, and
    loaded into memory.  The response tells the caller which changes were
    applied immediately and which require a restart.
    """
    import src.main

    if src.main.config is None:
        raise HTTPException(status_code=503, detail="Configuration not loaded")

    body = await request.json()

    current = src.main.config.model_dump()
    merged = _deep_merge(current, body)

    try:
        new_config = AppConfig.model_validate(merged)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    changed = _find_changed_paths(current, new_config.model_dump())

    applied = [
        p for p in changed if any(p.startswith(pr) for pr in _HOT_RELOAD_PREFIXES)
    ]
    restart_required = [
        p for p in changed if any(p.startswith(pr) for pr in _RESTART_REQUIRED_PREFIXES)
    ]

    # Persist to YAML
    config_path = get_config_path()
    with open(config_path, "w", encoding="utf-8") as fh:
        yaml.dump(
            new_config.model_dump(),
            fh,
            default_flow_style=False,
            allow_unicode=True,
            sort_keys=False,
        )

    # Update in-memory config
    src.main.config = new_config

    # Re-initialize LLM client if config changed
    if any(p.startswith("models.llm") for p in changed):
        from src.llm.client import init_llm_client, close_llm_client, _llm_lock
        async with _llm_lock:
            close_llm_client()
            init_llm_client(new_config.models.llm)

    return {"status": "ok", "applied": applied, "restart_required": restart_required}
