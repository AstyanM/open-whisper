# Voice-to-Speech Local

Local, real-time voice transcription powered by **Voxtral Mini 4B Realtime** (Mistral AI) via vLLM.
No data leaves your machine.

## Status

**Phase 1 — Foundations** (completed)

- [x] Tauri v2 + React + Vite project initialized
- [x] Tailwind CSS configured
- [x] Python backend (FastAPI) with config loading
- [x] Audio capture module (sounddevice)
- [x] vLLM Realtime WebSocket client
- [x] E2E test: mic → vLLM → console text

## Prerequisites

- **OS**: Windows 10/11 (64-bit) with **WSL2** (Ubuntu)
- **GPU**: NVIDIA with >= 16 GB VRAM (RTX 4060 Ti 16GB, RTX 4080/4090, RTX 3090, A4000+)
- **CUDA**: 12.x + cuDNN (inside WSL2)
- **Node.js**: 22+ (Windows)
- **Rust**: 1.75+ (Windows)
- **Python**: 3.13+ (Windows, for backend)
- **uv**: Python package manager (Windows)
- **vLLM**: Installed in a WSL2 Python venv

## Quick Start

### 1. Setup vLLM (WSL2 — one-time)

```bash
wsl
python3 -m venv ~/voxtral-env
source ~/voxtral-env/bin/activate
pip install vllm

# Download the model (disable Xet to avoid WSL2 crash)
HF_HUB_DISABLE_XET=1 huggingface-cli download mistralai/Voxtral-Mini-4B-Realtime-2602

# Create required symlink (Mistral uses non-standard weight filenames)
cd ~/.cache/huggingface/hub/models--mistralai--Voxtral-Mini-4B-Realtime-2602/snapshots/*/
ln -s consolidated.safetensors model.safetensors
```

### 2. Start vLLM (WSL2 — each session)

```bash
wsl
source ~/voxtral-env/bin/activate
VLLM_DISABLE_COMPILE_CACHE=1 vllm serve mistralai/Voxtral-Mini-4B-Realtime-2602 \
  --max-model-len 4096 \
  --gpu-memory-utilization 0.80 \
  --enforce-eager
```

Wait for `Uvicorn running on http://0.0.0.0:8000` before continuing.

### 3. Setup Backend (Windows — one-time)

```bash
cd backend
uv venv .venv --python 3.13
uv pip install -e ".[dev]"
```

### 4. Setup Frontend (Windows — one-time)

```bash
cd frontend
npm install
```

### 5. Run E2E Test (Windows)

With vLLM running in WSL2:

```bash
cd backend
.venv\Scripts\activate
python scripts\e2e_mic_to_text.py
```

Speak into the mic, then press `Ctrl+C` to stop and trigger transcription.

### 6. Run Full App (Windows)

Start three terminals:

**Terminal 1** — vLLM (WSL2, see step 2)

**Terminal 2** — Backend:
```bash
cd backend
.venv\Scripts\activate
python -m src.main
```

**Terminal 3** — Tauri + React (from project root):
```bash
npx tauri dev
```

> Run `npx tauri dev` from the project root — Tauri needs to find `src-tauri/` as a subfolder.

## Architecture

```
Tauri v2 (Rust shell) -> React 19 + Vite (frontend)
                              |
                              | WebSocket (localhost)
                              v
                     Python FastAPI (backend :8001)
                              |
                              | WebSocket /v1/realtime
                              v
                     vLLM + Voxtral Mini 4B (WSL2 :8000)
```

## Project Structure

```
voice-to-speech-local/
├── frontend/               # React 19 + Vite + Tailwind CSS
│   ├── src/                # React components
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── src-tauri/              # Tauri v2 (Rust desktop shell)
├── backend/
│   ├── src/
│   │   ├── main.py         # FastAPI entry point
│   │   ├── config.py       # Pydantic config loader
│   │   ├── audio/          # Microphone capture (sounddevice)
│   │   ├── transcription/  # vLLM WebSocket client
│   │   ├── storage/        # SQLite (Phase 2)
│   │   └── api/            # REST + WebSocket endpoints
│   ├── scripts/            # E2E test scripts
│   └── tests/
├── config.yaml             # User configuration (gitignored)
├── config.example.yaml     # Configuration template
└── prd.md                  # Product requirements
```

## Configuration

Copy `config.example.yaml` to `config.yaml` and adjust settings. Key options:

- **language**: Default transcription language (13 languages supported)
- **audio.device**: Microphone input device
- **models.transcription.delay_ms**: Streaming delay (80-2400ms, default 480ms)
- **backend.port**: Backend API port (default 8001)

## License

Apache 2.0
