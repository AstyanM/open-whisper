"""Custom exceptions for structured error handling."""


class VTSError(Exception):
    """Base exception for all OpenWhisper errors."""

    code: str = "unknown_error"

    def __init__(self, message: str, code: str | None = None):
        super().__init__(message)
        if code:
            self.code = code


class AudioDeviceError(VTSError):
    """Audio device error (generic)."""

    code = "audio_device_error"


class AudioDeviceNotFoundError(AudioDeviceError):
    """Microphone not found or unavailable."""

    code = "audio_device_not_found"


class AudioPermissionError(AudioDeviceError):
    """Microphone access denied."""

    code = "audio_permission_denied"


class WhisperModelError(VTSError):
    """Whisper model loading or transcription error."""

    code = "whisper_model_error"


class DatabaseError(VTSError):
    """Database operation failed."""

    code = "database_error"
