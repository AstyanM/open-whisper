"""Shared debug logging utility — file-based, immune to stdout/stderr issues.

Used by ws.py and whisper_client.py for guaranteed log output during
WebSocket sessions where standard logging may be unreliable.

Controlled by the ``OPENWHISPER_DEBUG`` environment variable.
Set to ``0`` or ``false`` to disable file-based debug logging.
"""

import os
import sys
from datetime import datetime
from pathlib import Path

_ENABLED = os.environ.get("OPENWHISPER_DEBUG", "1").lower() not in ("0", "false", "no")

_DEBUG_LOG = Path(__file__).resolve().parent.parent / "data" / "ws_debug.log"
if _ENABLED:
    _DEBUG_LOG.parent.mkdir(parents=True, exist_ok=True)


def debug_log(tag: str, msg: str) -> None:
    """Write debug message to a file AND stderr.

    Args:
        tag: Short label (e.g. "WS", "WHISPER", "FILE").
        msg: The log message.
    """
    if not _ENABLED:
        return
    line = f"{datetime.now().strftime('%H:%M:%S.%f')[:-3]} [{tag}] {msg}\n"
    try:
        with open(_DEBUG_LOG, "a", encoding="utf-8") as f:
            f.write(line)
            f.flush()
            os.fsync(f.fileno())
    except Exception:
        pass
    try:
        sys.stderr.write(line)
        sys.stderr.flush()
    except Exception:
        pass
