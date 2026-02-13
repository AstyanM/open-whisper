"""End-to-end test with STREAMING output: see text appear as you speak.

Same prerequisites as e2e_mic_to_text.py.
This variant uses concurrent tasks to send audio and receive transcription
simultaneously, so you see partial text while still speaking.

Usage:
    cd backend
    .venv/Scripts/activate
    python scripts/e2e_mic_to_text_streaming.py
"""

import asyncio
import json
import logging
import signal
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.config import load_config
from src.audio.capture import AudioCapture
from src.transcription.client import VLLMRealtimeClient

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


async def main():
    config = load_config()

    capture = AudioCapture(
        sample_rate=config.audio.sample_rate,
        channels=config.audio.channels,
        chunk_duration_ms=config.audio.chunk_duration_ms,
        device=config.audio.device,
    )

    client = VLLMRealtimeClient(
        host="localhost",
        port=config.models.transcription.vllm_port,
        model=config.models.transcription.name,
    )

    def handle_sigint():
        logger.info("\nStopping recording...")
        capture.stop()

    if sys.platform == "win32":
        signal.signal(signal.SIGINT, lambda s, f: handle_sigint())
    else:
        asyncio.get_running_loop().add_signal_handler(signal.SIGINT, handle_sigint)

    print("\n  Streaming E2E Test — Speak, see text appear in real-time.")
    print("  Press Ctrl+C to stop.\n")

    async with client.connect() as session:
        async def send_audio():
            """Send audio chunks from microphone to vLLM."""
            count = 0
            async for audio_b64 in capture.stream():
                await session.send_audio(audio_b64)
                count += 1
            logger.info(f"Sent {count} audio chunks")
            # Signal end of audio
            await session._ws.send(json.dumps({
                "type": "input_audio_buffer.commit",
                "final": True,
            }))

        async def receive_transcription():
            """Receive and print transcription deltas in real-time."""
            full_text = ""
            while True:
                try:
                    response = json.loads(await session._ws.recv())
                except Exception:
                    break

                msg_type = response.get("type", "")
                if msg_type == "transcription.delta":
                    delta = response.get("delta", "")
                    full_text += delta
                    print(delta, end="", flush=True)
                elif msg_type == "transcription.done":
                    print(f"\n\n--- Final: {response.get('text', full_text)} ---")
                    break
                elif msg_type == "error":
                    print(f"\nError: {response.get('error')}")
                    break

        await asyncio.gather(send_audio(), receive_transcription())


if __name__ == "__main__":
    asyncio.run(main())
