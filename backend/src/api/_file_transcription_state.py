"""State management for file transcription between REST upload and WebSocket progress."""

import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

_TTL_SECONDS = 600  # 10 minutes


@dataclass
class PendingTranscription:
    session_id: int
    file_path: Path
    language: str
    started_at: datetime
    filename: str
    created_at: float  # time.monotonic()


# Global registry
_pending: dict[int, PendingTranscription] = {}


def register_pending_transcription(
    session_id: int,
    file_path: Path,
    language: str,
    started_at: datetime,
    filename: str,
) -> PendingTranscription:
    _cleanup_stale()
    entry = PendingTranscription(
        session_id=session_id,
        file_path=file_path,
        language=language,
        started_at=started_at,
        filename=filename,
        created_at=time.monotonic(),
    )
    _pending[session_id] = entry
    return entry


def get_pending_transcription(session_id: int) -> PendingTranscription | None:
    _cleanup_stale()
    return _pending.get(session_id)


def remove_pending_transcription(session_id: int) -> None:
    _pending.pop(session_id, None)


def _cleanup_stale() -> None:
    """Remove entries older than TTL and delete their temp files."""
    now = time.monotonic()
    stale = [
        sid for sid, p in _pending.items()
        if (now - p.created_at) > _TTL_SECONDS
    ]
    for sid in stale:
        entry = _pending.pop(sid)
        try:
            entry.file_path.unlink(missing_ok=True)
        except Exception:
            pass
