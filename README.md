# OpenWhisper

![Python](https://img.shields.io/badge/Python-3.13-blue)
![Rust](https://img.shields.io/badge/Rust-1.75%2B-b7410e)
![React](https://img.shields.io/badge/React-19-61dafb)
![Tauri](https://img.shields.io/badge/Tauri-v2-24c8db)
![License](https://img.shields.io/badge/License-MIT-yellow)

Local, real-time voice transcription powered by **Voxtral Mini 4B Realtime** (Mistral AI) via vLLM.
Two modes — **dictation** (inject text at cursor) and **transcription** (dedicated window with timestamped history).
Zero cloud dependency — all processing happens on-device.

---

## Motivation

Cloud-based transcription services raise privacy concerns and require an internet connection.
OpenWhisper runs entirely on your machine: your audio never leaves your hardware.

| Mode | How it works | Use case |
|------|-------------|----------|
| **Dictation** | `Ctrl+Shift+D` activates mic, transcribed text is injected at cursor in any app | Quick emails, notes, messages |
| **Transcription** | `Ctrl+Shift+T` opens a dedicated window with real-time timestamps and session history | Meetings, calls, long-form notes |

Both modes stream audio through a local vLLM server running Voxtral Mini 4B with AWQ quantization, keeping VRAM usage under 4 GB.

---

## Features

- **Real-time streaming transcription** — 80 ms audio chunks streamed via WebSocket
- **Dictation mode** — global shortcut injects text at cursor via Win32 SendInput
- **Transcription mode** — timestamped segments, session history, SQLite storage
- **Semantic search** — ChromaDB + all-MiniLM-L6-v2 embeddings for searching past sessions
- **Always-on-top overlay** — transparent, click-through indicator (mic status, language, mode)
- **System tray** — quick access menu, language switching
- **13 languages** — fr, en, es, pt, hi, de, nl, it, ar, ru, zh, ja, ko
- **Dark / light theme** — warm stone + amber palette, automatic or manual toggle
- **Fully configurable** — `config.yaml` with hot-reload for most settings

---

## Architecture Overview

```
┌──────────────────────────────────────────────────┐
│                  Tauri v2 (Rust)                  │
│                                                   │
│  ┌──────────────┐  ┌─────────┐  ┌────────────┐  │
│  │  React 19    │  │ Overlay │  │ System Tray│  │
│  │  + Vite      │  │ Window  │  │            │  │
│  └──────┬───────┘  └────┬────┘  └─────┬──────┘  │
│         └────────┬──────┘─────────────┘          │
│          Global shortcuts · Text injection        │
│          (enigo / SendInput)                      │
└──────────────────┬───────────────────────────────┘
                   │ HTTP + WebSocket (localhost:8001)
         ┌─────────┴─────────┐
         │  Python Backend   │
         │    (FastAPI)      │
         │                   │
         │  · Audio capture  │
         │    (sounddevice)  │
         │  · SQLite storage │
         │  · ChromaDB search│
         │  · Config manager │
         └─────────┬─────────┘
                   │ WebSocket /v1/realtime (localhost:8000)
         ┌─────────┴─────────┐
         │    vLLM Server    │
         │  Voxtral Mini 4B  │
         │    (GPU, AWQ)     │
         └───────────────────┘
```

**Only the vLLM layer requires a GPU** — the backend and frontend run on CPU.

---

## Tech Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| Desktop shell | Tauri v2 (Rust) | Global shortcuts, overlay, system tray, text injection |
| Frontend | React 19, Vite, TypeScript | Tailwind CSS v4, shadcn/ui, Radix UI, Lucide icons |
| Backend | Python 3.13, FastAPI, uvicorn | Async, WebSocket-first, hot-reloadable config |
| Audio | sounddevice (PortAudio) | 16 kHz mono, 80 ms chunks |
| Transcription | vLLM + Voxtral Mini 4B | AWQ quantization, ~3.5 GB VRAM |
| Storage | SQLite (aiosqlite) | Sessions + timestamped segments |
| Semantic search | ChromaDB + all-MiniLM-L6-v2 | 384-dim embeddings, CPU inference |
| Text injection | enigo 0.6 + arboard 3 | Win32 SendInput, clipboard fallback |

---

## Project Structure

```
openwhisper/
├── config.example.yaml          # Configuration template
├── package.json                 # Root convenience scripts
├── prd.md                       # Product requirements document
│
├── backend/                     # Python backend (FastAPI)
│   ├── pyproject.toml
│   ├── src/
│   │   ├── main.py              # Entry point
│   │   ├── config.py            # Pydantic config loader
│   │   ├── api/
│   │   │   ├── routes.py        # REST endpoints
│   │   │   └── ws.py            # WebSocket (audio streaming)
│   │   ├── audio/
│   │   │   └── capture.py       # Microphone capture
│   │   ├── search/
│   │   │   ├── vector_store.py  # ChromaDB integration
│   │   │   └── backfill.py      # Auto-index existing sessions
│   │   ├── storage/
│   │   │   ├── database.py      # SQLite init + migrations
│   │   │   └── repository.py    # CRUD for sessions & segments
│   │   └── transcription/
│   │       └── client.py        # WebSocket client to vLLM
│   └── tests/
│
├── frontend/                    # React + Vite + Tailwind CSS
│   ├── src/
│   │   ├── App.tsx              # Router (react-router-dom v7)
│   │   ├── components/          # UI components + shadcn/ui
│   │   ├── hooks/               # useWebSocket, useTranscription, ...
│   │   ├── lib/                 # API client, Tauri bridge, utils
│   │   └── pages/               # Transcription, Sessions, Settings, Overlay
│   └── public/
│       └── icon.svg             # App icon
│
└── src-tauri/                   # Tauri v2 (Rust)
    ├── Cargo.toml
    ├── tauri.conf.json
    └── src/
        ├── main.rs              # Entry point
        ├── shortcuts.rs         # Global shortcut registration
        ├── tray.rs              # System tray
        └── injection.rs         # Text injection (enigo/SendInput)
```

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| **OS** | Windows 10/11 (64-bit) |
| **GPU** | NVIDIA with >= 16 GB VRAM (RTX 4060 Ti 16 GB, RTX 4080/4090, RTX 3090, A4000+) |
| **CUDA** | 12.x + cuDNN |
| **Python** | 3.13+ |
| **Node.js** | 20+ |
| **Rust** | 1.75+ |
| **uv** | Latest (Python package manager) |
| **vLLM** | Latest (installed in WSL2) |

> **Note**: vLLM currently requires Linux. On Windows, run it inside **WSL2** (Ubuntu).

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/AstyanM/openwhisper.git
cd openwhisper
```

### 2. Setup vLLM (WSL2 — one-time)

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

### 3. Setup backend (Windows — one-time)

```bash
cd backend
uv venv .venv --python 3.13
uv pip install -e ".[dev]"
```

### 4. Setup frontend (Windows — one-time)

```bash
cd frontend
npm install
```

### 5. Copy configuration

```bash
cp config.example.yaml config.yaml
```

Edit `config.yaml` to set your preferred language, audio device, and other options.

---

## Usage

### Start vLLM (WSL2 — each session)

```bash
wsl
source ~/voxtral-env/bin/activate
VLLM_DISABLE_COMPILE_CACHE=1 vllm serve mistralai/Voxtral-Mini-4B-Realtime-2602 \
  --max-model-len 4096 \
  --gpu-memory-utilization 0.80 \
  --enforce-eager
```

Wait for `Uvicorn running on http://0.0.0.0:8000` before continuing.

### Start the app (Windows)

Run two terminals:

**Terminal 1** — Backend:
```bash
npm run backend
```

**Terminal 2** — Tauri + React:
```bash
npm run tauri dev
```

### Global shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+D` | Toggle dictation mode (text injected at cursor) |
| `Ctrl+Shift+T` | Toggle transcription mode (open/focus window) |

### Run tests

```bash
npm run test:backend
```

---

## Configuration

All settings live in `config.yaml` at the project root (copy from `config.example.yaml`).

| Setting | Default | Description |
|---------|---------|-------------|
| `language` | `"fr"` | Transcription language (13 supported) |
| `audio.device` | `"default"` | Microphone input device name or index |
| `audio.chunk_duration_ms` | `80` | Audio chunk size (80 ms = 1 Voxtral token) |
| `models.transcription.delay_ms` | `480` | Streaming delay (80–2400 ms) |
| `models.transcription.vllm_port` | `8000` | vLLM server port |
| `overlay.enabled` | `true` | Show overlay window |
| `overlay.position` | `"top-right"` | Overlay screen position |
| `backend.port` | `8001` | Backend API port |

Most settings apply immediately via hot-reload. Changes to ports or model settings require a restart.

### Supported languages

`fr` `en` `es` `pt` `hi` `de` `nl` `it` `ar` `ru` `zh` `ja` `ko`

---

## Data Model

```sql
sessions
├── id            INTEGER PRIMARY KEY
├── mode          TEXT        -- 'dictation' | 'transcription'
├── language      TEXT        -- ISO code (fr, en, ...)
├── started_at    DATETIME
├── ended_at      DATETIME
├── duration_s    REAL
└── summary       TEXT        -- V2: LLM-generated summary

segments
├── id            INTEGER PRIMARY KEY
├── session_id    INTEGER     -- FK → sessions
├── text          TEXT
├── start_ms      INTEGER     -- Offset from session start
├── end_ms        INTEGER
└── confidence    REAL
```

Semantic search is powered by **ChromaDB** (stored in `./data/chroma/`), which auto-indexes sessions on completion and supports full-text + metadata filtering.

---

## Roadmap

- [x] **Phase 1** — Foundations (Tauri + React + FastAPI scaffold, audio capture, vLLM client)
- [x] **Phase 2** — Transcription mode (WebSocket streaming, React UI, SQLite storage)
- [x] **Phase 3** — Dictation + overlay (text injection, overlay window, system tray)
- [x] **Phase 4.1** — Robustness & tests (error handling, backend test suite)
- [x] **Phase 4.2** — Settings page (REST config API, audio device picker, hot-reload)
- [x] **Phase 4.3** — Session UX + search (ChromaDB, semantic search, filters, toasts)
- [x] **Phase 4.4** — UI redesign (warm stone + amber palette, dark/light theme, new logo)
- [ ] **Phase 4.5** — Packaging & release (setup script, installer, GitHub release)
- [ ] **Phase 5** — V2 features (auto-summary, export, speaker diarization, voice commands)

---

## Contributing

Contributions are welcome! Please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## Author

- **Martin Astyan** — [GitHub](https://github.com/AstyanM)

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
