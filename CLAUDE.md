# CLAUDE.md — Voice-to-Speech Local

## Project Overview

Local real-time voice transcription app powered by **Voxtral Mini 4B Realtime** (Mistral AI). Zero cloud dependency — all processing happens on-device. Two modes: **dictation** (inject text at cursor) and **transcription** (dedicated window with timestamped history).

## Architecture

Three-layer architecture communicating over localhost:

```
Tauri v2 (Rust shell + React frontend)
    ↕ HTTP + WebSocket (localhost:8001)
Python Backend (FastAPI)
    ↕ WebSocket /v1/realtime (localhost:8000)
vLLM Server (Voxtral Mini 4B, GPU)
```

- **Frontend** (`frontend/`): React 19 + Vite + Tailwind CSS v4 + shadcn/ui. Served by Tauri webview.
- **Tauri** (`src-tauri/`): Rust shell — global shortcuts, text injection (enigo), overlay window, system tray, sidecar process management.
- **Backend** (`backend/`): Python 3.13 + FastAPI — audio capture (sounddevice), WebSocket streaming, SQLite storage, ChromaDB semantic search, config loading.
- **Config**: `config.yaml` at project root, validated by Pydantic in `backend/src/config.py`.

## Tech Stack

| Layer | Technology | Key details |
|-------|-----------|-------------|
| Desktop shell | Tauri v2 | Rust, global shortcuts via `tauri-plugin-global-shortcut` |
| Frontend | React 19, Vite 7, TypeScript 5.9 | Path alias `@/` → `frontend/src/` |
| UI | shadcn/ui, Tailwind CSS v4, Radix UI, Lucide icons | |
| Backend | Python 3.13, FastAPI, uvicorn | Async, WebSocket-first |
| Audio | sounddevice (PortAudio wrapper) | 16kHz mono, 80ms chunks |
| Transcription | vLLM + Voxtral Mini 4B Realtime | AWQ quantization, GPU |
| Storage | SQLite via aiosqlite | Sessions + timestamped segments |
| Semantic search | ChromaDB + all-MiniLM-L6-v2 | 384-dim embeddings, local CPU |
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

## Project Structure

```
voice-to-speech-local/
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
│       │   ├── routes.py        # REST endpoints (health, sessions, config, search)
│       │   └── ws.py            # WebSocket endpoints (audio stream)
│       ├── audio/
│       │   └── capture.py       # Microphone capture (sounddevice)
│       ├── search/
│       │   ├── vector_store.py  # ChromaDB singleton (index, search, delete)
│       │   └── backfill.py      # Backfill existing sessions into ChromaDB
│       ├── storage/
│       │   ├── database.py      # SQLite init + migrations
│       │   └── repository.py    # CRUD for sessions & segments
│       └── transcription/
│           └── client.py        # WebSocket client to vLLM
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
│       │   ├── DeleteSessionDialog.tsx  # AlertDialog for session deletion
│       │   ├── SessionSearchBar.tsx     # Search + filter bar (semantic + metadata)
│       │   └── ui/              # shadcn/ui primitives (alert-dialog, sonner, ...)
│       ├── hooks/
│       │   ├── useWebSocket.ts
│       │   ├── useTranscription.ts
│       │   ├── useDictation.ts
│       │   └── useTauriShortcuts.ts
│       ├── lib/
│       │   ├── api.ts           # REST client to backend (sessions, search, config)
│       │   ├── tauri.ts         # Tauri IPC bridge
│       │   ├── constants.ts
│       │   └── utils.ts         # cn() helper (clsx + tailwind-merge)
│       └── pages/
│           ├── TranscriptionPage.tsx
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
- **Backend structure**: Domain modules (`audio/`, `transcription/`, `storage/`, `search/`, `api/`), each with `__init__.py`.
- **Config access**: Always through Pydantic models in `backend/src/config.py`, never raw YAML parsing.
- **Tauri v2**: `app.title` does NOT exist — window title goes in `app.windows[].title` only.
- **Tauri windows**: Two windows defined — `main` (900x700, resizable) and `overlay` (100x36, transparent, always-on-top, click-through).
- **Global shortcuts**: `Ctrl+Shift+D` (dictation), `Ctrl+Shift+T` (transcription).
- **WebSocket-first**: Audio streaming and transcription use WebSocket, not REST.

## Build Environment (Windows)

**Critical**: Git's `link.exe` shadows the MSVC linker. Fixed in `src-tauri/.cargo/config.toml` which explicitly sets:
- MSVC linker path: `C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\link.exe`
- Windows SDK lib/include paths for version `10.0.26100.0`

**Tauri CLI**: Must be installed via `npm install -g @tauri-apps/cli@latest` (not `cargo install` — fails with linker issue).

Prerequisites:
- Windows 10/11 (64-bit)
- NVIDIA GPU with >= 16 GB VRAM
- MSVC 14.44.35207 (VS 2022 Community)
- Windows SDK 10.0.26100.0
- Node.js 20+, Python 3.13, Rust 1.75+
- CUDA 12.x + cuDNN

## Current State

- **Phase 1** (Foundations): Completed — Tauri + React + FastAPI scaffold, config loading, audio capture, overlay, system tray, global shortcuts, dictation mode.
- **Phase 2** (Transcription mode): Completed — WebSocket frontend<->backend, React UI, SQLite storage.
- **Phase 3** (Dictation + overlay): Completed — Text injection, overlay window, dictation mode.
- **Phase 4.1** (Robustness & Tests): Completed — Error handling, backend tests.
- **Phase 4.2** (Settings page): Completed — GET/PUT /api/config, GET /api/audio/devices, SettingsPage with hot-reload.
- **Phase 4.3** (Session UX + Search): Completed — AlertDialog delete, optimistic delete with animation, toast notifications, ChromaDB semantic search, metadata filters (language, mode, date, duration), search endpoint, auto-backfill.
- See `prd.md` for full roadmap and feature backlog.

## Data Model (SQLite)

Two main tables:
- `sessions`: id, mode ('dictation'|'transcription'), language, started_at, ended_at, duration_s, summary (V2)
- `segments`: id, session_id (FK), text, start_ms, end_ms, confidence

## Semantic Search (ChromaDB)

- **Storage**: `./data/chroma/` directory (sibling to SQLite `sessions.db`)
- **Collection**: `sessions` — one document per session containing full concatenated text
- **Metadata per document**: session_id, language, mode, duration_s, started_at
- **Embedding model**: `all-MiniLM-L6-v2` (384-dim, downloaded to `~/.cache/chroma/` on first use, ~80MB)
- **Indexing**: Automatic on session end (in `ws.py`), deleted on session removal (in `routes.py`)
- **Backfill**: Auto-indexes existing sessions on first startup if ChromaDB collection is empty
- **API**: `GET /api/sessions/search?q=...&language=...&mode=...&date_from=...&date_to=...&duration_min=...&duration_max=...`
- **Graceful degradation**: If ChromaDB init fails, search falls back to SQL-only filtering

## Key Ports

| Service | Port | Protocol |
|---------|------|----------|
| Vite dev server | 5173 | HTTP |
| FastAPI backend | 8001 | HTTP + WebSocket |
| vLLM server | 8000 | WebSocket |
