"""Tests for vLLM Realtime client with mock WebSocket server."""

import asyncio
import json
import socket

import pytest
import websockets

from src.transcription.client import VLLMRealtimeClient
from src.exceptions import VLLMConnectionError, VLLMTimeoutError, VLLMProtocolError


@pytest.fixture
def free_port():
    """Get a free TCP port."""
    with socket.socket() as s:
        s.bind(("", 0))
        return s.getsockname()[1]


@pytest.mark.asyncio
async def test_connect_refused_raises_vllm_error():
    """When vLLM is not running, should raise VLLMConnectionError."""
    client = VLLMRealtimeClient(host="localhost", port=19999)
    with pytest.raises(VLLMConnectionError):
        async with client.connect(language="fr"):
            pass


@pytest.mark.asyncio
async def test_full_session_with_mock_server(free_port):
    """Full session: connect, send audio, receive deltas, done."""

    async def mock_vllm(ws):
        # Send session.created
        await ws.send(json.dumps({"type": "session.created", "id": "test-123"}))

        # Receive session.update
        msg = json.loads(await ws.recv())
        assert msg["type"] == "session.update"

        # Receive initial commit
        msg = json.loads(await ws.recv())
        assert msg["type"] == "input_audio_buffer.commit"

        # Receive audio chunks until final commit
        while True:
            msg = json.loads(await ws.recv())
            if msg.get("type") == "input_audio_buffer.commit" and msg.get("final"):
                break

        # Send transcription deltas
        await ws.send(json.dumps({"type": "transcription.delta", "delta": "Hello "}))
        await ws.send(json.dumps({"type": "transcription.delta", "delta": "world"}))
        await ws.send(json.dumps({"type": "transcription.done", "text": "Hello world"}))

    async with websockets.serve(mock_vllm, "localhost", free_port):
        client = VLLMRealtimeClient(host="localhost", port=free_port)
        async with client.connect(language="fr") as session:
            # Send some audio
            await session.send_audio("dGVzdA==")  # base64 "test"

            # Signal end of audio
            await session._ws.send(json.dumps({
                "type": "input_audio_buffer.commit",
                "final": True,
            }))

            # Collect streaming deltas
            deltas = []
            async for delta in session.stream_transcription():
                deltas.append(delta)

    assert deltas == ["Hello ", "world"]


@pytest.mark.asyncio
async def test_vllm_error_message_raises(free_port):
    """vLLM error message should raise RuntimeError."""

    async def mock_vllm(ws):
        await ws.send(json.dumps({"type": "session.created", "id": "x"}))
        await ws.recv()  # session.update
        await ws.recv()  # initial commit
        await ws.send(json.dumps({"type": "error", "error": "Model not loaded"}))

    async with websockets.serve(mock_vllm, "localhost", free_port):
        client = VLLMRealtimeClient(host="localhost", port=free_port)
        async with client.connect() as session:
            with pytest.raises(RuntimeError, match="vLLM error"):
                async for _ in session.stream_transcription():
                    pass


@pytest.mark.asyncio
async def test_wrong_handshake_raises_protocol_error(free_port):
    """Wrong initial message should raise VLLMProtocolError."""

    async def mock_vllm(ws):
        await ws.send(json.dumps({"type": "unexpected.message"}))

    async with websockets.serve(mock_vllm, "localhost", free_port):
        client = VLLMRealtimeClient(host="localhost", port=free_port)
        with pytest.raises(VLLMProtocolError):
            async with client.connect():
                pass


@pytest.mark.asyncio
async def test_finish_collects_full_text(free_port):
    """Test finish() method collects all deltas and returns TranscriptionResult."""

    async def mock_vllm(ws):
        await ws.send(json.dumps({"type": "session.created", "id": "test-fin"}))
        await ws.recv()  # session.update
        await ws.recv()  # initial commit

        # Receive final commit from finish()
        msg = json.loads(await ws.recv())
        assert msg["type"] == "input_audio_buffer.commit"
        assert msg["final"] is True

        await ws.send(json.dumps({"type": "transcription.delta", "delta": "Bonjour "}))
        await ws.send(json.dumps({"type": "transcription.delta", "delta": "le monde"}))
        await ws.send(json.dumps({
            "type": "transcription.done",
            "text": "Bonjour le monde",
            "usage": {"tokens": 42},
        }))

    async with websockets.serve(mock_vllm, "localhost", free_port):
        client = VLLMRealtimeClient(host="localhost", port=free_port)
        async with client.connect() as session:
            result = await session.finish()

    assert result.text == "Bonjour le monde"
    assert result.usage == {"tokens": 42}
