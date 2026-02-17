# CLAUDE.md — OpenWhisper

## Project Overview

Local real-time voice transcription app powered by **faster-whisper** (OpenAI Whisper via CTranslate2). Zero cloud dependency — all processing happens on-device. Three modes: **dictation** (inject text at cursor), **transcription** (dedicated window with timestamped history), and **file** (upload audio files for offline transcription). Optional **LLM post-processing** (summarize, to-do list, reformulate) via any OpenAI-compatible API (Ollama, LM Studio, etc.).

## Architecture

Two-layer architecture communicating over localhost:

```
Tauri v2 (Rust shell + React frontend)
    ↕ HTTP + WebSocket (localhost:8001)
Python Backend (FastAPI + faster-whisper)
```

- **Frontend** (`frontend/`): React 19 + Vite + Tailwind CSS v4 + shadcn/ui. Served by Tauri webview.
- **Tauri** (`src-tauri/`): Rust shell — global shortcuts, text injection (enigo), overlay window, system tray, sidecar process management.
- **Backend** (`backend/`): Python 3.13 + FastAPI — audio capture (sounddevice), faster-whisper transcription, file transcription, WebSocket streaming, SQLite storage, ChromaDB semantic search, LLM post-processing (OpenAI-compatible), config loading.
- **Config**: `config.yaml` at project root, validated by Pydantic in `backend/src/config.py`.

## Tech Stack

| Layer | Technology | Key details |
|-------|-----------|-------------|
| Desktop shell | Tauri v2 | Rust, global shortcuts via `tauri-plugin-global-shortcut` |
| Frontend | React 19, Vite 7, TypeScript 5.9 | Path alias `@/` → `frontend/src/` |
| UI | shadcn/ui, Tailwind CSS v4, Radix UI, Lucide icons | |
| Backend | Python 3.13, FastAPI, uvicorn | Async, WebSocket-first |
| Audio | sounddevice (PortAudio wrapper) | 16kHz mono, 80ms chunks |
| Transcription | faster-whisper (CTranslate2) | Whisper models (tiny → large-v3 / large-v3-turbo), CUDA or CPU |
| Storage | SQLite via aiosqlite | Sessions + timestamped segments |
| Semantic search | ChromaDB + paraphrase-multilingual-MiniLM-L12-v2 | 384-dim multilingual embeddings, ONNX, local CPU |
| LLM processing | openai SDK (AsyncOpenAI) | OpenAI-compatible API (Ollama, LM Studio, etc.) |
| File upload | python-multipart | WAV, MP3, FLAC, OGG, M4A, WebM, WMA, AAC, Opus |
| Text injection | enigo 0.6 + arboard 3 (clipboard fallback) | Win32 SendInput |
| Package mgmt | npm (frontend), uv (backend), cargo (Rust) | |

## Development Commands

All commands from project root:

```bash
# Frontend dev server (Vite, port 5173)
npm run dev

# Backend (FastAPI, port 8001)
npm run backend
# equivalent to: cd backend && .venv\Scripts\python -m src.main

# Tauri dev (launches frontend + Rust shell)
npm run tauri dev

# Backend tests
npm run test:backend
# equivalent to: cd backend && .venv\Scripts\python -m pytest tests/ -v

# Frontend tests (vitest)
cd frontend && npm test
# or watch mode: cd frontend && npm run test:watch

# Frontend lint
cd frontend && npm run lint

# Tauri build (production)
npm run tauri build
```

## Backend Setup

```bash
cd backend
uv venv --python 3.13
uv pip install -e ".[dev]"
```

- Venv: `backend/.venv`
- Build system: hatchling, packages = `["src"]`
- Entry point: `python -m src.main`
- Python version: 3.13 (requires-python >= 3.12)
- Key dependency: `faster-whisper>=1.1.0` (Whisper model downloaded automatically on first run)

## Project Structure

```
openwhisper/
├── CLAUDE.md                    # This file
├── config.yaml                  # User config (gitignored, use config.example.yaml)
├── config.example.yaml          # Config template
├── package.json                 # Root convenience scripts
├── prd.md                       # Product requirements document
│
├── backend/                     # Python backend
│   ├── pyproject.toml
│   └── src/
│       ├── main.py              # FastAPI entry point
│       ├── config.py            # Pydantic config loader (config.yaml)
│       ├── exceptions.py        # Custom exception classes
│       ├── api/
│       │   ├── routes.py        # REST endpoints (health, sessions, config, search, LLM, file upload)
│       │   ├── ws.py            # WebSocket endpoints (audio stream, file transcription)
│       │   └── _file_transcription_state.py  # Pending file upload state registry (REST→WS bridge)
│       ├── audio/
│       │   └── capture.py       # Microphone capture (sounddevice)
│       ├── llm/
│       │   └── client.py        # LLM client (OpenAI-compatible: summarize, rewrite, scenarios)
│       ├── search/
│       │   ├── embedding.py     # Multilingual ONNX embedding function (paraphrase-multilingual-MiniLM-L12-v2)
│       │   ├── vector_store.py  # ChromaDB singleton (index, search, delete)
│       │   └── backfill.py      # Backfill existing sessions into ChromaDB
│       ├── storage/
│       │   ├── database.py      # SQLite init + migrations (V0→V1)
│       │   └── repository.py    # CRUD for sessions & segments
│       └── transcription/
│           ├── whisper_client.py   # faster-whisper integration (WhisperClient + WhisperSession)
│           └── file_transcriber.py # File-based audio transcription (streaming segments)
│
├── frontend/                    # React + Vite
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx             # React entry point
│       ├── App.tsx              # Router (react-router-dom v7)
│       ├── components/          # UI components
│       │   ├── Layout.tsx
│       │   ├── TranscriptionView.tsx
│       │   ├── StatusIndicator.tsx
│       │   ├── LanguageSelector.tsx
│       │   ├── BackendStatusBanner.tsx  # Backend health check banner
│       │   ├── DeleteSessionDialog.tsx  # AlertDialog for session deletion
│       │   ├── SessionSearchBar.tsx     # Search + filter bar (semantic + metadata)
│       │   ├── ScenarioCards.tsx        # LLM scenario processing buttons (summarize, todo, reformulate)
│       │   ├── ScenarioResult.tsx       # LLM scenario result display (copy, dismiss, markdown)
│       │   ├── MicTest.tsx              # Microphone test component
│       │   ├── LogoMark.tsx             # Inline SVG logo component
│       │   ├── ThemeProvider.tsx         # next-themes provider
│       │   ├── ThemeToggle.tsx           # Dark/light mode toggle
│       │   └── ui/              # shadcn/ui primitives (alert-dialog, sonner, ...)
│       ├── hooks/
│       │   ├── useWebSocket.ts
│       │   ├── useTranscription.ts
│       │   ├── useDictation.ts
│       │   ├── useFileTranscription.ts  # File upload transcription workflow hook
│       │   ├── useSettings.ts
│       │   ├── useBackendHealth.ts
│       │   └── useTauriShortcuts.ts
│       ├── lib/
│       │   ├── api.ts           # REST client to backend (sessions, search, config, LLM, file upload)
│       │   ├── tauri.ts         # Tauri IPC bridge
│       │   ├── constants.ts
│       │   └── utils.ts         # cn() helper (clsx + tailwind-merge)
│       └── pages/
│           ├── TranscriptionPage.tsx
│           ├── FileUploadPage.tsx    # Audio file upload + transcription page
│           ├── SessionListPage.tsx   # Session list with search/filter bar
│           ├── SessionDetailPage.tsx
│           ├── SettingsPage.tsx
│           └── OverlayPage.tsx
│
└── src-tauri/                   # Tauri v2 (Rust)
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── .cargo/config.toml       # MSVC linker fix (see Build Environment)
    ├── capabilities/
    │   └── default.json         # Permissions: shortcuts, tray
    └── src/
        ├── main.rs              # Entry point
        ├── lib.rs               # Tauri setup, plugin registration
        ├── shortcuts.rs         # Global shortcut registration
        ├── tray.rs              # System tray setup
        └── injection.rs         # Text injection (enigo/SendInput)
```

## Conventions

- **Language**: All code, comments, commit messages, and documentation in **English**.
- **Frontend imports**: Use `@/` path alias (e.g., `import { cn } from "@/lib/utils"`).
- **UI components**: Use shadcn/ui. Primitives live in `frontend/src/components/ui/`.
- **Backend structure**: Domain modules (`audio/`, `transcription/`, `storage/`, `search/`, `llm/`, `api/`), each with `__init__.py`.
- **Config access**: Always through Pydantic models in `backend/src/config.py`, never raw YAML parsing.
- **Tauri v2**: `app.title` does NOT exist — window title goes in `app.windows[].title` only.
- **Tauri windows**: Two windows defined — `main` (900x700, resizable) and `overlay` (100x36, transparent, always-on-top, click-through).
- **Global shortcuts**: `Ctrl+Shift+D` (dictation), `Ctrl+Shift+T` (transcription).
- **WebSocket-first**: Audio streaming and transcription use WebSocket, not REST.
- **Session modes**: `'dictation'`, `'transcription'`, `'file'` (audio file upload).
- **Frontend routes**: `/` (transcription), `/sessions` (list), `/sessions/:id` (detail), `/upload` (file upload), `/settings`, `/overlay`.

## Build Environment (Windows)

**Critical**: Git's `link.exe` shadows the MSVC linker. Fixed in `src-tauri/.cargo/config.toml` which explicitly sets:
- MSVC linker path: `C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\link.exe`
- Windows SDK lib/include paths for version `10.0.26100.0`

**Tauri CLI**: Must be installed via `npm install -g @tauri-apps/cli@latest` (not `cargo install` — fails with linker issue).

Prerequisites:
- Windows 10/11 (64-bit)
- MSVC 14.44.35207 (VS 2022 Community)
- Windows SDK 10.0.26100.0
- Node.js 20+, Python 3.13, Rust 1.75+
- GPU optional: NVIDIA with CUDA 12.x for accelerated transcription (faster-whisper works on CPU too)

## Transcription Engine (faster-whisper)

- **Library**: faster-whisper >= 1.1.0 (CTranslate2-based Whisper implementation)
- **Model sizes**: `tiny`, `base`, `small`, `medium`, `large-v3`, `large-v3-turbo`
- **Device**: `auto` (CUDA if available, else CPU), `cuda`, or `cpu`
- **Compute type**: `auto`, `float16`, `int8`, `int8_float16`
- **VAD**: Silero VAD filter to skip silent regions
- **Buffer**: Configurable audio buffer (1–10 seconds) before transcription
- **Architecture**: `WhisperClient` manages model lifecycle, `WhisperSession` handles per-session audio buffering and transcription streaming
- **Model download**: Automatic on first use, cached in `~/.cache/huggingface/`

## LLM Post-Processing

Optional integration with any OpenAI-compatible LLM API for text processing after transcription.

- **Client**: `backend/src/llm/client.py` — singleton `AsyncOpenAI` client, init/close lifecycle
- **Scenarios**: `summarize` (2-4 sentence summary), `todo_list` (extract actionable items as markdown checkboxes), `reformulate` (clean up filler words, grammar, transcription artifacts)
- **API endpoints**:
  - `POST /api/sessions/{id}/summarize` — generate/update session summary
  - `POST /api/llm/process` — process text with a scenario (`{"text", "scenario", "language"}`)
  - `POST /api/llm/rewrite` — rewrite text with custom instruction (`{"text", "instruction"}`)
- **Auto-summarize**: When `models.llm.auto_summarize` is true, sessions are summarized automatically on end
- **Config** (`models.llm` in `config.yaml`):
  - `enabled`: bool (default `false`) — master toggle
  - `api_url`: str (default `http://localhost:11434/v1`) — OpenAI-compatible endpoint (Ollama, LM Studio, etc.)
  - `api_key`: str (default `ollama`)
  - `model`: str (default `mistral:7b`)
  - `temperature`: float (0.0–2.0, default `0.3`)
  - `max_tokens`: int (64–4096, default `512`)
  - `auto_summarize`: bool (default `true`)
- **Frontend**: `ScenarioCards` (3 color-coded buttons) + `ScenarioResult` (display with copy/dismiss), shown in TranscriptionPage and FileUploadPage
- **Languages**: 13 supported (fr, en, es, pt, hi, de, nl, it, ar, ru, zh, ja, ko) — system prompts adapt to target language
- **Graceful degradation**: All LLM features disabled if `enabled: false` or API unavailable

## File Transcription

Upload audio files for offline transcription (instead of live microphone capture).

- **Supported formats**: WAV, MP3, FLAC, OGG, M4A, WebM, WMA, AAC, Opus
- **Max upload size**: Configurable via `max_upload_size_mb` (50–1024 MB, default `500`)
- **Three-step flow**:
  1. `POST /api/transcribe/file` — upload file, create DB session (mode=`file`), save temp file
  2. State registry (`_file_transcription_state.py`) bridges REST upload → WebSocket connection
  3. `WS /ws/transcribe-file/{session_id}` — stream transcription progress + segments, cleanup temp file
- **WebSocket messages**: `status`, `file_info` (audio duration), `transcript_delta`, `progress` (percent), `session_ended`, `error`
- **Frontend**: `/upload` route → `FileUploadPage` with drag-and-drop, progress bar, language selector, ScenarioCards integration
- **Hook**: `useFileTranscription` — manages upload workflow states (idle → uploading → transcribing → completed)
- **Backend**: `file_transcriber.py` — async generator using faster-whisper's native ffmpeg decoding, quality filtering (compression_ratio, avg_logprob thresholds)

## Current State

- **Phase 1** (Foundations): Completed — Tauri + React + FastAPI scaffold, config loading, audio capture, overlay, system tray, global shortcuts, dictation mode.
- **Phase 2** (Transcription mode): Completed — WebSocket frontend<->backend, React UI, SQLite storage.
- **Phase 3** (Dictation + overlay): Completed — Text injection, overlay window, dictation mode.
- **Phase 4.1** (Robustness & Tests): Completed — Error handling, backend tests.
- **Phase 4.2** (Settings page): Completed — GET/PUT /api/config, GET /api/audio/devices, SettingsPage with hot-reload.
- **Phase 4.3** (Session UX + Search): Completed — AlertDialog delete, optimistic delete with animation, toast notifications, ChromaDB semantic search, metadata filters (language, mode, date, duration), search endpoint, auto-backfill.
- **Phase 4.4** (UI redesign): Completed — Renamed to OpenWhisper, warm stone + amber palette, Plus Jakarta Sans + JetBrains Mono fonts, dark/light theme toggle, new logo.
- **Phase 4.4b** (Model migration): Completed — Replaced vLLM/Voxtral with faster-whisper. No external server needed.
- **Phase 4.5** (LLM post-processing): Completed — OpenAI-compatible LLM integration (summarize, to-do list, reformulate), ScenarioCards/ScenarioResult UI, auto-summarize on session end.
- **Phase 4.6** (File transcription): Completed — Audio file upload, drag-and-drop UI, streaming progress, file_transcriber backend, WebSocket progress channel.
- **Phase 4.6b** (Search improvements): Completed — Multilingual ONNX embeddings (paraphrase-multilingual-MiniLM-L12-v2), auto-migration from English model, search state persisted in URL params.
- See `prd.md` for full roadmap and feature backlog.

## Data Model (SQLite)

Two main tables:
- `sessions`: id, mode ('dictation'|'transcription'|'file'), language, started_at, ended_at, duration_s, summary, filename (V1 migration)
- `segments`: id, session_id (FK), text, start_ms, end_ms, confidence

Migrations tracked via `PRAGMA user_version` (current: V1 — added `filename` column).

## Semantic Search (ChromaDB)

- **Storage**: `./data/chroma/` directory (sibling to SQLite `sessions.db`)
- **Collection**: `sessions` — one document per session containing full concatenated text
- **Metadata per document**: session_id, language, mode, duration_s, started_at
- **Embedding model**: `paraphrase-multilingual-MiniLM-L12-v2` (384-dim, 50+ languages, ONNX, downloaded to `~/.cache/chroma/onnx_models/` on first use)
- **Embedding function**: Custom `MultilingualEmbeddingFunction` in `backend/src/search/embedding.py` (ONNX + tokenizers, no PyTorch)
- **Config**: `search.embedding_model` in `config.yaml` (configurable, auto-migration on model change)
- **Indexing**: Automatic on session end (in `ws.py`), deleted on session removal (in `routes.py`)
- **Backfill**: Auto-indexes existing sessions on first startup if ChromaDB collection is empty or embedding model changed
- **API**: `GET /api/sessions/search?q=...&language=...&mode=...&date_from=...&date_to=...&duration_min=...&duration_max=...`
- **Graceful degradation**: If ChromaDB init fails, search falls back to SQL-only filtering

## Key Ports

| Service | Port | Protocol |
|---------|------|----------|
| Vite dev server | 5173 | HTTP |
| FastAPI backend | 8001 | HTTP + WebSocket |
