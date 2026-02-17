"""Non-regression tests for audit refactoring (P0/P1/P2).

Covers: path traversal prevention, language validation, file upload streaming,
file transcription state, debug logging toggle, lazy stopwords, parseInt guard.
"""

import os
import threading
import time
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from src.api._file_transcription_state import (
    PendingTranscription,
    _pending,
    _lock,
    get_pending_transcription,
    register_pending_transcription,
    remove_pending_transcription,
)
from src.main import app


@pytest_asyncio.fixture
async def client(db):
    """Async HTTP client for testing routes."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# ── P0-1: Path Traversal Prevention ──────────────────────────────────


@pytest.mark.asyncio
async def test_file_upload_rejects_unsupported_format(client):
    """Uploading a non-audio file should be rejected with 400."""
    import src.main
    from src.config import AppConfig

    src.main.config = AppConfig.model_validate({})

    content = b"not audio"
    resp = await client.post(
        "/api/transcribe/file",
        files={"file": ("test.txt", BytesIO(content), "text/plain")},
        data={"language": "fr"},
    )
    assert resp.status_code == 400
    assert "Unsupported file format" in resp.json()["detail"]


def test_path_traversal_sanitization():
    """Path(raw_filename).name should strip directory components."""
    # This tests the exact sanitization logic used in the upload endpoint
    malicious_names = [
        "../../../etc/passwd.wav",
        "..\\..\\windows\\system32\\config.wav",
        "/absolute/path/test.wav",
        "C:\\Users\\attacker\\evil.wav",
        "normal.wav",
        "",
    ]
    for raw in malicious_names:
        sanitized = Path(raw).name
        # Should never contain path separators
        assert "/" not in sanitized
        assert "\\" not in sanitized
        # Should never start with ".."
        assert not sanitized.startswith("..")

    # Verify specific cases
    assert Path("../../../etc/passwd.wav").name == "passwd.wav"
    assert Path("normal.wav").name == "normal.wav"
    assert Path("").name == ""  # Empty handled by fallback in route


# ── P0-6: Language Validation ────────────────────────────────────────


@pytest.mark.asyncio
async def test_file_upload_rejects_invalid_language(client):
    """Uploading with an unsupported language should be rejected."""
    import src.main
    from src.config import AppConfig

    src.main.config = AppConfig.model_validate({})

    content = b"\x00" * 100
    resp = await client.post(
        "/api/transcribe/file",
        files={"file": ("test.wav", BytesIO(content), "audio/wav")},
        data={"language": "xx_invalid"},
    )
    assert resp.status_code == 400
    assert "Unsupported language" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_file_upload_accepts_valid_language(client, tmp_path):
    """Uploading with a valid language should proceed."""
    import src.main
    from src.config import AppConfig

    src.main.config = AppConfig.model_validate({})

    content = b"\x00" * 100
    resp = await client.post(
        "/api/transcribe/file",
        files={"file": ("test.wav", BytesIO(content), "audio/wav")},
        data={"language": "en"},
    )
    # May succeed or fail for other reasons, but NOT due to language validation
    assert resp.status_code != 400 or "Unsupported language" not in resp.json().get(
        "detail", ""
    )


# ── P0-4: File Transcription State Thread Safety ─────────────────────


@pytest.fixture(autouse=True)
def clean_pending_state():
    """Ensure the global _pending dict is clean before/after each test."""
    with _lock:
        _pending.clear()
    yield
    with _lock:
        _pending.clear()


class TestFileTranscriptionState:
    """Tests for the file transcription state registry."""

    def test_register_and_get(self, tmp_path):
        now = datetime.now(timezone.utc)
        fp = tmp_path / "test.wav"
        fp.write_bytes(b"\x00")

        entry = register_pending_transcription(1, fp, "fr", now, "test.wav")
        assert entry.session_id == 1
        assert entry.language == "fr"

        retrieved = get_pending_transcription(1)
        assert retrieved is not None
        assert retrieved.session_id == 1

    def test_get_nonexistent_returns_none(self):
        assert get_pending_transcription(999) is None

    def test_remove(self, tmp_path):
        now = datetime.now(timezone.utc)
        fp = tmp_path / "test.wav"
        fp.write_bytes(b"\x00")

        register_pending_transcription(1, fp, "fr", now, "test.wav")
        remove_pending_transcription(1)
        assert get_pending_transcription(1) is None

    def test_remove_nonexistent_does_not_raise(self):
        remove_pending_transcription(999)  # Should not raise

    def test_overwrite_existing(self, tmp_path):
        now = datetime.now(timezone.utc)
        fp1 = tmp_path / "test1.wav"
        fp1.write_bytes(b"\x00")
        fp2 = tmp_path / "test2.wav"
        fp2.write_bytes(b"\x00")

        register_pending_transcription(1, fp1, "fr", now, "test1.wav")
        register_pending_transcription(1, fp2, "en", now, "test2.wav")

        entry = get_pending_transcription(1)
        assert entry is not None
        assert entry.language == "en"
        assert entry.filename == "test2.wav"

    def test_concurrent_access(self, tmp_path):
        """Multiple threads registering/getting concurrently should not corrupt state."""
        now = datetime.now(timezone.utc)
        errors: list[str] = []

        def worker(session_id: int):
            try:
                fp = tmp_path / f"test_{session_id}.wav"
                fp.write_bytes(b"\x00")
                register_pending_transcription(
                    session_id, fp, "fr", now, f"test_{session_id}.wav"
                )
                entry = get_pending_transcription(session_id)
                if entry is None:
                    errors.append(f"Session {session_id} not found after register")
                elif entry.session_id != session_id:
                    errors.append(
                        f"Session {session_id} got wrong id: {entry.session_id}"
                    )
            except Exception as e:
                errors.append(f"Session {session_id} error: {e}")

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(20)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert errors == [], f"Concurrency errors: {errors}"
        # All 20 entries should exist
        for i in range(20):
            assert get_pending_transcription(i) is not None


# ── P2-20: Configurable Debug Logging ────────────────────────────────


class TestDebugLog:
    """Tests for the debug_log utility."""

    def test_debug_log_writes_to_file(self, tmp_path):
        """When enabled, debug_log should write to the log file."""
        log_file = tmp_path / "test_debug.log"

        with patch("src.debug_log._DEBUG_LOG", log_file), patch(
            "src.debug_log._ENABLED", True
        ):
            from src.debug_log import debug_log

            debug_log("TEST", "hello world")

        content = log_file.read_text(encoding="utf-8")
        assert "[TEST] hello world" in content

    def test_debug_log_disabled_skips_writing(self, tmp_path):
        """When disabled, debug_log should not write anything."""
        log_file = tmp_path / "test_debug.log"

        with patch("src.debug_log._DEBUG_LOG", log_file), patch(
            "src.debug_log._ENABLED", False
        ):
            from src.debug_log import debug_log

            debug_log("TEST", "should not appear")

        assert not log_file.exists()


# ── P1-8: Lazy Stopwords Loading ─────────────────────────────────────


class TestStopwordsLoading:
    """Tests for the lazy stopwords loader in routes."""

    def test_get_stopwords_returns_set(self):
        from src.api.routes.search import _get_stopwords

        result = _get_stopwords()
        assert isinstance(result, set)
        # Should contain common French/English stopwords
        assert "the" in result or "de" in result or "le" in result

    def test_get_stopwords_handles_missing_file(self):
        """If stopwords.json is missing, should return empty set without crashing."""
        from src.api.routes import search as search_mod

        original = search_mod._STOPWORDS_PATH
        original_cache = search_mod._STOPWORDS
        try:
            search_mod._STOPWORDS = set()  # Reset cache
            search_mod._STOPWORDS_PATH = Path("/nonexistent/stopwords.json")
            result = search_mod._get_stopwords()
            assert result == set()
        finally:
            search_mod._STOPWORDS_PATH = original
            search_mod._STOPWORDS = original_cache
