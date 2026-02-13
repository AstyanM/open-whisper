"""End-to-end test: Microphone -> vLLM Voxtral -> Text in console.

Prerequisites:
    1. vLLM must be running with Voxtral Mini 4B:
       vllm serve mistralai/Voxtral-Mini-4B-Realtime-2602

    2. A working microphone must be available.

Usage:
    cd backend
    .venv/Scripts/activate          # Windows
    python scripts/e2e_mic_to_text.py

    Speak into your microphone. Press Ctrl+C to stop recording.
    The transcribed text will be printed to the console.
"""

import asyncio
import logging
import signal
import sys
from pathlib import Path

# Add parent directory to path so we can import src modules
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.config import load_config
from src.audio.capture import AudioCapture
from src.transcription.client import VLLMRealtimeClient

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


async def main():
    config = load_config()
    logger.info(f"Language: {config.language}")
    logger.info(
        f"Audio: {config.audio.sample_rate}Hz, {config.audio.channels}ch, "
        f"{config.audio.chunk_duration_ms}ms chunks"
    )
    logger.info(
        f"vLLM: ws://localhost:{config.models.transcription.vllm_port}/v1/realtime"
    )

    # List available audio devices
    devices = AudioCapture.list_devices()
    logger.info("Available audio input devices:")
    for dev in devices:
        logger.info(
            f"  [{dev['index']}] {dev['name']} "
            f"({dev['channels']}ch, {dev['sample_rate']}Hz)"
        )

    # Create audio capture
    capture = AudioCapture(
        sample_rate=config.audio.sample_rate,
        channels=config.audio.channels,
        chunk_duration_ms=config.audio.chunk_duration_ms,
        device=config.audio.device,
    )

    # Create vLLM client
    client = VLLMRealtimeClient(
        host="localhost",
        port=config.models.transcription.vllm_port,
        model=config.models.transcription.name,
    )

    # Handle Ctrl+C gracefully
    def handle_sigint():
        logger.info("\nCtrl+C detected, stopping recording...")
        capture.stop()

    if sys.platform == "win32":
        signal.signal(signal.SIGINT, lambda s, f: handle_sigint())
    else:
        asyncio.get_running_loop().add_signal_handler(signal.SIGINT, handle_sigint)

    print("\n" + "=" * 60)
    print("  Voice-to-Speech Local — E2E Test")
    print("  Speak into your microphone. Press Ctrl+C to stop.")
    print("=" * 60 + "\n")

    chunk_count = 0

    async with client.connect() as session:
        # Stream audio chunks to vLLM
        async for audio_b64 in capture.stream():
            chunk_count += 1
            await session.send_audio(audio_b64)

            if chunk_count % 50 == 0:
                duration_s = chunk_count * config.audio.chunk_duration_ms / 1000
                logger.info(
                    f"Recording... {duration_s:.1f}s ({chunk_count} chunks sent)"
                )

        # Audio capture stopped (Ctrl+C was pressed)
        duration_s = chunk_count * config.audio.chunk_duration_ms / 1000
        logger.info(f"Recording stopped. Total: {duration_s:.1f}s, {chunk_count} chunks")

        # Get final transcription
        print("\nWaiting for transcription...")
        result = await session.finish()

        print("\n" + "=" * 60)
        print("  TRANSCRIPTION RESULT")
        print("=" * 60)
        print(f"\n{result.text}\n")
        if result.usage:
            print(f"Usage: {result.usage}")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
