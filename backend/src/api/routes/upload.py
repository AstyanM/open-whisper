"""Audio file upload endpoint for file-based transcription."""

import logging
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Form

from src.api._helpers import _get_repo

logger = logging.getLogger(__name__)

router = APIRouter()

ACCEPTED_AUDIO_EXTENSIONS = {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".webm", ".wma", ".aac", ".opus"}


@router.post("/api/transcribe/file")
async def upload_file_for_transcription(
    file: UploadFile = File(...),
    language: str = Form("fr"),
):
    """Upload an audio file for transcription.

    Returns session_id immediately. Connect to /ws/transcribe-file/{session_id}
    for real-time transcription progress.
    """
    from src.main import config as app_config
    from src.config import SUPPORTED_LANGUAGES

    # Validate language
    if language not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported language: {language}. Supported: {', '.join(SUPPORTED_LANGUAGES)}",
        )

    max_size_mb = app_config.max_upload_size_mb if app_config else 500
    max_size = max_size_mb * 1024 * 1024

    raw_filename = file.filename or "unknown"
    # Sanitize: strip directory components to prevent path traversal
    filename = Path(raw_filename).name
    if not filename:
        filename = "unknown"
    ext = Path(filename).suffix.lower()
    if ext not in ACCEPTED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format: {ext}. Accepted: {', '.join(sorted(ACCEPTED_AUDIO_EXTENSIONS))}",
        )

    # Stream upload to temp file to avoid holding entire file in memory
    temp_dir = Path(tempfile.gettempdir()) / "openwhisper_uploads"
    temp_dir.mkdir(exist_ok=True)
    temp_path = temp_dir / f"{int(datetime.now().timestamp())}_{filename}"
    total_size = 0
    _CHUNK_SIZE = 64 * 1024  # 64 KB
    try:
        with open(temp_path, "wb") as f:
            while True:
                chunk = await file.read(_CHUNK_SIZE)
                if not chunk:
                    break
                total_size += len(chunk)
                if total_size > max_size:
                    f.close()
                    temp_path.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail=f"File too large (max {max_size_mb} MB)")
                f.write(chunk)
    except HTTPException:
        raise
    except Exception as exc:
        temp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {exc}")

    # Create DB session
    repo = _get_repo()
    started_at = datetime.now(timezone.utc)
    session_id = await repo.create_session(
        mode="file",
        language=language,
        started_at=started_at,
        filename=filename,
    )

    # Register for the WebSocket handler to pick up
    from src.api._file_transcription_state import register_pending_transcription
    register_pending_transcription(session_id, temp_path, language, started_at, filename)

    logger.info(f"File uploaded for transcription: {filename} -> session {session_id}")
    return {"session_id": session_id, "status": "pending"}
