# OpenWhisper

![Python](https://img.shields.io/badge/Python-3.13-blue)
![Rust](https://img.shields.io/badge/Rust-1.75%2B-b7410e)
![React](https://img.shields.io/badge/React-19-61dafb)
![Tauri](https://img.shields.io/badge/Tauri-v2-24c8db)
![License](https://img.shields.io/badge/License-MIT-yellow)

Local, real-time voice transcription powered by **faster-whisper** (OpenAI Whisper).
Three modes — **dictation** (inject text at cursor), **transcription** (dedicated window with timestamped history), and **file upload** (offline audio transcription).
Optional **LLM post-processing** (summarize, to-do list, reformulate) via any OpenAI-compatible API.
Zero cloud dependency — all processing happens on-device.

---

## Motivation

Cloud-based transcription services raise privacy concerns and require an internet connection.
OpenWhisper runs entirely on your machine: your audio never leaves your hardware.

| Mode | How it works | Use case |
|------|-------------|----------|
| **Dictation** | `Ctrl+Shift+D` activates mic, transcribed text is injected at cursor in any app | Quick emails, notes, messages |
| **Transcription** | `Ctrl+Shift+T` opens a dedicated window with real-time timestamps and session history | Meetings, calls, long-form notes |
| **File upload** | Drag-and-drop audio files (WAV, MP3, FLAC, OGG, M4A, WebM, etc.) for offline transcription | Podcast episodes, recorded interviews, voice memos |

All modes use a local faster-whisper engine running directly in the Python backend. With CUDA, the `large-v3-turbo` model uses ~3 GB VRAM; the `small` model runs comfortably on CPU.

---

## Features

- **Real-time streaming transcription** — audio chunks streamed via WebSocket, transcribed with faster-whisper
- **Dictation mode** — global shortcut injects text at cursor via Win32 SendInput
- **Transcription mode** — timestamped segments, session history, SQLite storage
- **File upload transcription** — drag-and-drop audio files (WAV, MP3, FLAC, OGG, M4A, WebM, WMA, AAC, Opus) with streaming progress
- **LLM post-processing** (optional) — summarize, extract to-do lists, or reformulate transcriptions via any OpenAI-compatible API (Ollama, LM Studio, etc.)
- **Auto-summarize** — sessions automatically summarized by LLM on completion (configurable)
- **Multilingual semantic search** — ChromaDB + multilingual embeddings (50+ languages, ONNX), summary-first indexing, exact keyword match boosting, configurable distance threshold, relevance scores
- **Always-on-top overlay** — transparent, click-through indicator (mic status, language, mode)
- **System tray** — quick access menu, language switching
- **Multiple Whisper model sizes** — tiny, base, small, medium, large-v3, large-v3-turbo
- **VAD filtering** — skip silent regions for faster processing
- **13 languages** — fr, en, es, pt, hi, de, nl, it, ar, ru, zh, ja, ko
- **Dark / light theme** — warm stone + amber palette, automatic or manual toggle
- **Fully configurable** — `config.yaml` with hot-reload for most settings

---

## Architecture Overview

```
┌──────────────────────────────────────────────────┐
│                  Tauri v2 (Rust)                 │
│                                                  │
│  ┌──────────────┐  ┌─────────┐  ┌────────────┐   │
│  │  React 19    │  │ Overlay │  │ System Tray│   │
│  │  + Vite      │  │ Window  │  │            │   │
│  └──────┬───────┘  └────┬────┘  └─────┬──────┘   │
│         └────────┬──────┘─────────────┘          │
│          Global shortcuts · Text injection       │
│          (enigo / SendInput)                     │
└──────────────────┬───────────────────────────────┘
                   │ HTTP + WebSocket (localhost:8001)
         ┌─────────┴──────────┐
         │  Python Backend    │
         │    (FastAPI)       │
         │                    │
         │  · faster-whisper  │
         │    (Whisper STT)   │
         │  · Audio capture   │
         │    (sounddevice)   │
         │  · File transcr.   │
         │  · LLM processing  │
         │    (OpenAI-compat) │
         │  · SQLite storage  │
         │  · ChromaDB search │
         │  · Config manager  │
         └────────────────────┘
```

**No external server required** — faster-whisper runs inside the Python backend process. GPU (CUDA) is optional: it accelerates transcription but the app works on CPU too.

---

## Tech Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| Desktop shell | Tauri v2 (Rust) | Global shortcuts, overlay, system tray, text injection |
| Frontend | React 19, Vite, TypeScript | Tailwind CSS v4, shadcn/ui, Radix UI, Lucide icons |
| Backend | Python 3.13, FastAPI, uvicorn | Async, WebSocket-first, hot-reloadable config |
| Audio | sounddevice (PortAudio) | 16 kHz mono, 80 ms chunks |
| Transcription | faster-whisper (CTranslate2) | Whisper models (tiny → large-v3-turbo), CUDA or CPU |
| Storage | SQLite (aiosqlite) | Sessions + timestamped segments |
| Semantic search | ChromaDB + paraphrase-multilingual-MiniLM-L12-v2 | 384-dim multilingual embeddings, ONNX, CPU inference |
| LLM processing | openai SDK (AsyncOpenAI) | Any OpenAI-compatible API (Ollama, LM Studio, etc.) |
| File upload | python-multipart | WAV, MP3, FLAC, OGG, M4A, WebM, WMA, AAC, Opus |
| Text injection | enigo 0.6 + arboard 3 | Win32 SendInput, clipboard fallback |

---

## Project Structure

```
openwhisper/
├── setup.bat                    # Automated setup script (Windows)
├── config.example.yaml          # Configuration template
├── package.json                 # Root convenience scripts
│
├── backend/                     # Python backend (FastAPI)
│   ├── pyproject.toml
│   ├── src/
│   │   ├── main.py              # Entry point
│   │   ├── config.py            # Pydantic config loader
│   │   ├── exceptions.py        # Custom exception classes
│   │   ├── api/
│   │   │   ├── _helpers.py      # Shared helpers (_get_repo, _session_to_dict)
│   │   │   ├── routes/          # REST endpoints (split by domain)
│   │   │   │   ├── health.py    # GET /health
│   │   │   │   ├── config.py    # GET/PUT /api/config (hot-reload)
│   │   │   │   ├── audio.py     # GET /api/audio/devices
│   │   │   │   ├── sessions.py  # CRUD /api/sessions
│   │   │   │   ├── search.py    # GET /api/sessions/search (semantic + exact match)
│   │   │   │   ├── llm.py       # LLM endpoints (summarize, rewrite, process)
│   │   │   │   └── upload.py    # POST /api/transcribe/file
│   │   │   ├── ws.py            # WebSocket (audio + file transcription streaming)
│   │   │   └── _file_transcription_state.py  # REST→WS state bridge for file uploads
│   │   ├── audio/
│   │   │   └── capture.py       # Microphone capture
│   │   ├── llm/
│   │   │   └── client.py        # LLM client (OpenAI-compatible: summarize, rewrite, scenarios)
│   │   ├── search/
│   │   │   ├── embedding.py     # Multilingual ONNX embedding function
│   │   │   ├── vector_store.py  # ChromaDB integration
│   │   │   ├── backfill.py      # Auto-index existing sessions
│   │   │   └── stopwords.json   # Multilingual stopwords (7 languages)
│   │   ├── storage/
│   │   │   ├── database.py      # SQLite init + migrations (V0→V1)
│   │   │   └── repository.py    # CRUD for sessions & segments
│   │   └── transcription/
│   │       ├── whisper_client.py   # faster-whisper integration
│   │       └── file_transcriber.py # File-based audio transcription
│   └── tests/
│
├── frontend/                    # React + Vite + Tailwind CSS
│   ├── src/
│   │   ├── App.tsx              # Router (react-router-dom v7)
│   │   ├── components/          # UI components + shadcn/ui (ScenarioCards, ScenarioResult, ...)
│   │   │   └── settings/        # Settings page section components (7 sub-components)
│   │   ├── hooks/               # useWebSocket, useTranscription, useFileTranscription, ...
│   │   ├── lib/                 # API client, Tauri bridge, utils
│   │   └── pages/               # Transcription, FileUpload, Sessions, Settings, Overlay
│   └── public/
│       └── icon.svg             # App icon
│
└── src-tauri/                   # Tauri v2 (Rust)
    ├── Cargo.toml
    ├── tauri.conf.json
    └── src/
        ├── main.rs              # Entry point
        ├── lib.rs               # Tauri setup, plugin registration
        ├── shortcuts.rs         # Global shortcut registration
        ├── tray.rs              # System tray
        └── injection.rs         # Text injection (enigo/SendInput)
```

---

## Prerequisites

| Requirement | Version | Install |
|-------------|---------|---------|
| **OS** | Windows 10/11 (64-bit) | |
| **Python** | 3.12+ | [python.org](https://www.python.org/downloads/) |
| **Node.js** | 20+ | [nodejs.org](https://nodejs.org/) |
| **Rust** | 1.75+ *(for Tauri builds only)* | [rustup.rs](https://rustup.rs/) |
| **Visual Studio 2022** | Community *(for Tauri builds only)* | [VS Installer](https://visualstudio.microsoft.com/) — select "Desktop development with C++" |
| **GPU** *(optional)* | NVIDIA with CUDA 12.x | Accelerates transcription |

> **Note**: A GPU is **not required**. The setup auto-selects `large-v3-turbo` on GPU or `small` on CPU. Rust and Visual Studio are only needed if you want to build the Tauri desktop app — the backend + web frontend work without them.

---

## Installation

### Quick setup (recommended)

```bash
git clone https://github.com/AstyanM/open-whisper.git
cd open-whisper
.\setup.bat
```

The setup script automatically:
- Checks prerequisites (Python, Node.js, uv)
- Creates the Python virtual environment and installs backend dependencies
- Installs frontend npm dependencies
- Creates `config.yaml` from the template
- Detects MSVC/Windows SDK and generates the Cargo linker config for Tauri builds

### Manual setup

If you prefer to set up manually or are troubleshooting:

```bash
# 1. Clone
git clone https://github.com/AstyanM/open-whisper.git
cd open-whisper

# 2. Backend
cd backend
uv venv --python 3.13
uv pip install -e ".[dev]"
cd ..

# 3. Frontend
cd frontend
npm install
cd ..

# 4. Config (optional — app works with defaults if missing)
copy config.example.yaml config.yaml
```

The Whisper model (~1.5 GB for large-v3-turbo, ~500 MB for small) is downloaded automatically on first startup.

---

## Usage

### Start the app

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
| `language` | `"en"` | Transcription language (13 supported) |
| `max_upload_size_mb` | `500` | Max file upload size in MB (50–1024) |
| `models.transcription.model_size` | `"auto"` | Whisper model: `auto`, `tiny`, `base`, `small`, `medium`, `large-v3`, `large-v3-turbo`. Auto = large-v3-turbo on GPU, small on CPU |
| `models.transcription.device` | `"auto"` | Inference device: `auto`, `cuda`, `cpu` |
| `models.transcription.compute_type` | `"auto"` | Precision: `auto`, `float16`, `int8`, `int8_float16` |
| `models.transcription.beam_size` | `5` | 1 = greedy (fast), 5 = beam search (accurate) |
| `models.transcription.vad_filter` | `true` | Skip silent regions (recommended) |
| `models.transcription.buffer_duration_s` | `10.0` | Seconds of audio to buffer before transcribing (1–30) |
| `models.llm.enabled` | `false` | Enable LLM post-processing features |
| `models.llm.api_url` | `"http://localhost:11434/v1"` | OpenAI-compatible API endpoint |
| `models.llm.model` | `"mistral:7b"` | LLM model name |
| `models.llm.auto_summarize` | `true` | Auto-summarize sessions on completion |
| `search.embedding_model` | `"paraphrase-multilingual-MiniLM-L12-v2"` | Embedding model for semantic search (multilingual) |
| `search.distance_threshold` | `1.0` | Max cosine distance for results (0.0–2.0). Lower = stricter |
| `audio.device` | `"default"` | Microphone input device name or index |
| `audio.chunk_duration_ms` | `80` | Audio chunk size in ms |
| `overlay.enabled` | `false` | Show overlay window (requires Tauri desktop app) |
| `overlay.position` | `"top-right"` | Overlay screen position |
| `backend.port` | `8001` | Backend API port |

Most settings apply immediately via hot-reload. Changes to model or port settings require a restart.

### LLM Post-Processing (optional)

OpenWhisper can use any OpenAI-compatible API for post-processing transcriptions. Three scenarios are available:

| Scenario | Description |
|----------|-------------|
| **Summarize** | Generate a 2-4 sentence summary of key points |
| **To-do list** | Extract actionable items as markdown checkboxes |
| **Reformulate** | Clean up filler words, grammar, and transcription artifacts |

Example setup with [Ollama](https://ollama.ai):

```bash
# Install and pull a model
ollama pull mistral:7b

# In config.yaml
models:
  llm:
    enabled: true
    api_url: "http://localhost:11434/v1"
    model: "mistral:7b"
```

### Supported languages

`fr` `en` `es` `pt` `hi` `de` `nl` `it` `ar` `ru` `zh` `ja` `ko`

---

## Data Model

```sql
sessions
├── id            INTEGER PRIMARY KEY
├── mode          TEXT        -- 'dictation' | 'transcription' | 'file'
├── language      TEXT        -- ISO code (fr, en, ...)
├── started_at    DATETIME
├── ended_at      DATETIME
├── duration_s    REAL
├── summary       TEXT        -- LLM-generated summary
└── filename      TEXT        -- Original filename (file uploads only, V1 migration)

segments
├── id            INTEGER PRIMARY KEY
├── session_id    INTEGER     -- FK → sessions
├── text          TEXT
├── start_ms      INTEGER     -- Offset from session start
├── end_ms        INTEGER
└── confidence    REAL
```

Semantic search is powered by **ChromaDB** with multilingual embeddings (stored in `./data/chroma/`). Sessions are indexed using their LLM summary when available (falls back to full transcript text). Search uses two-tier ranking: exact keyword matches appear first, then semantic-only matches — both sorted by cosine similarity. A configurable distance threshold filters out irrelevant results. The embedding model (`paraphrase-multilingual-MiniLM-L12-v2`) supports 50+ languages and runs via ONNX on CPU — no PyTorch needed.

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
