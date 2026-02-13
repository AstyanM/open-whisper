# Voice-to-Speech Local — Product Requirements Document

## 1. Vision produit

Application de transcription vocale temps réel, 100% locale, basée sur **Voxtral Mini 4B Realtime** (Mistral AI). Aucune donnée ne quitte la machine de l'utilisateur.

Deux modes d'utilisation :

- **Dictée vocale** : un raccourci global active le micro, le texte s'injecte directement au curseur actif dans n'importe quelle application.
- **Transcription longue** : une fenêtre dédiée pour transcrire des réunions, appels ou sessions de travail, avec historique horodaté et résumé automatique par LLM local.

**Public cible** : développeurs et power-users souhaitant une solution de transcription performante, privée et configurable. Projet open source (GitHub, licence Apache 2.0).

---

## 2. Cas d'usage

| Cas d'usage              | Mode          | Description                                                                                |
| ------------------------ | ------------- | ------------------------------------------------------------------------------------------ |
| Dictée rapide            | Dictée        | Rédiger un email, une note, un message en parlant. Le texte apparaît là où le curseur est. |
| Transcription de réunion | Transcription | Session longue avec plusieurs interlocuteurs. Historique complet horodaté.                 |
| Transcription d'appel    | Transcription | Capturer une conversation téléphonique/visio avec résumé automatique.                      |
| Prise de notes vocales   | Transcription | Dicter des idées en continu, retrouver le texte plus tard via recherche.                   |

---

## 3. Fonctionnalités

### 3.1 MVP (v1)

#### Mode dictée (clavier vocal)

- Raccourci global `Ctrl+Shift+D` pour activer/désactiver la dictée
- Capture audio du microphone en temps réel
- Transcription streaming via Voxtral Mini 4B (vLLM, WebSocket)
- Injection du texte transcrit au curseur actif (simulation de frappe via Win32 SendInput)
- Feedback visuel via overlay (micro actif/inactif)

#### Mode transcription (fenêtre dédiée)

- Raccourci global `Ctrl+Shift+T` pour ouvrir/focus la fenêtre
- Interface React avec zone de texte en temps réel
- Horodatage des segments transcrits
- Bouton start/stop enregistrement dans l'interface
- Sauvegarde automatique de la session en SQLite

#### Overlay

- Fenêtre transparente, always-on-top, click-through
- Indicateur visuel : micro ON (rouge) / OFF (gris)
- Affichage de la langue active
- Position configurable (coin de l'écran)

#### System tray

- Icône dans la barre de notification Windows
- Menu contextuel : ouvrir fenêtre, changer de langue, quitter
- Démarrage et arrêt des services (vLLM, backend)

#### Historique et stockage

- Base SQLite locale pour toutes les sessions
- Chaque session : id, date, durée, langue, texte complet, segments horodatés
- Liste des sessions passées dans l'interface

#### Configuration

- Fichier `config.yaml` à la racine du projet
- Paramétrable : langue par défaut, raccourcis, modèles, position overlay, device audio
- Toutes les 13 langues Voxtral disponibles (FR par défaut)

#### Infrastructure

- Démarrage automatique : Tauri lance le backend Python (FastAPI) + vLLM
- Backend Python dans un venv dédié
- Communication frontend ↔ backend via WebSocket localhost
- Communication backend ↔ vLLM via WebSocket `/v1/realtime`

### 3.2 V2 (évolutions)

| Feature             | Description                                                                  | Priorité |
| ------------------- | ---------------------------------------------------------------------------- | -------- |
| Résumé automatique  | LLM local (Mistral 7B Q4, CPU) résume chaque session en fin d'enregistrement | Haute    |
| Recherche full-text | Recherche dans l'historique des transcriptions (SQLite FTS5)                 | Haute    |
| Export              | Markdown, TXT, SRT (sous-titres)                                             | Moyenne  |
| Diarisation         | Identification des locuteurs distincts                                       | Moyenne  |
| Commandes vocales   | "nouveau paragraphe", "point", "efface ça", "correction"                     | Moyenne  |
| Thème sombre/clair  | Choix du thème dans les paramètres                                           | Basse    |
| Statistiques        | Temps de parole, mots/minute, sessions par jour                              | Basse    |
| Multi-plateforme    | Support macOS (voxtral.c + MPS) et Linux                                     | Basse    |

---

## 4. Architecture technique

### 4.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────┐
│                      Tauri v2 Shell                      │
│                                                          │
│  ┌────────────────┐  ┌───────────┐  ┌────────────────┐  │
│  │  React + Vite  │  │  Overlay  │  │  System Tray   │  │
│  │   (main UI)    │  │ (window)  │  │                │  │
│  └───────┬────────┘  └─────┬─────┘  └───────┬────────┘  │
│          └─────────────┬───┘────────────────┘            │
│               Rust (minimal)                              │
│    · Global shortcuts (Ctrl+Shift+D/T)                   │
│    · Text injection (enigo / SendInput)                   │
│    · Sidecar process management                          │
│    · IPC with frontend                                   │
│               └──────────┬───────┘                       │
└──────────────────────────┼───────────────────────────────┘
                           │ HTTP + WebSocket (localhost)
                ┌──────────┴──────────┐
                │   Python Backend    │
                │     (FastAPI)       │
                │                     │
                │  · Audio capture    │
                │    (sounddevice)    │
                │  · Session manager  │
                │  · SQLite storage   │
                │  · Config loader    │
                │  · Summary LLM     │
                │    (V2, CPU)        │
                └──────────┬──────────┘
                           │ WebSocket /v1/realtime
                ┌──────────┴──────────┐
                │   vLLM Server       │
                │   Voxtral Mini 4B   │
                │   (GPU, quantifié)  │
                └─────────────────────┘
```

### 4.2 Flux de données

#### Mode dictée

1. Utilisateur presse `Ctrl+Shift+D`
2. Tauri (Rust) envoie un signal au frontend React via IPC
3. React ouvre une connexion WebSocket vers le backend Python
4. Python démarre la capture audio (sounddevice, 16kHz, mono)
5. Python streame les chunks audio vers vLLM via WebSocket
6. vLLM renvoie les tokens transcrits en continu
7. Python pousse les tokens vers le frontend via WebSocket
8. Frontend envoie les tokens à Tauri (Rust) via IPC
9. Rust injecte le texte au curseur actif via SendInput/enigo
10. L'overlay affiche l'indicateur "micro actif"
11. L'utilisateur re-presse `Ctrl+Shift+D` → arrêt du flux

#### Mode transcription

1. Utilisateur presse `Ctrl+Shift+T`
2. Tauri ouvre/focus la fenêtre de transcription
3. L'utilisateur clique "Démarrer" ou le raccourci active l'enregistrement
4. Même flux audio que la dictée (étapes 4-7)
5. Le texte s'affiche en temps réel dans la fenêtre React avec horodatage
6. Sauvegarde continue en SQLite (segments horodatés)
7. Arrêt → session finalisée, prête pour résumé (V2)

### 4.3 Modèle de données (SQLite)

```sql
CREATE TABLE sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    mode        TEXT NOT NULL,          -- 'dictation' | 'transcription'
    language    TEXT NOT NULL DEFAULT 'fr',
    started_at  DATETIME NOT NULL,
    ended_at    DATETIME,
    duration_s  REAL,
    summary     TEXT,                   -- V2: résumé LLM
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE segments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL REFERENCES sessions(id),
    text        TEXT NOT NULL,
    start_ms    INTEGER NOT NULL,       -- offset depuis début session
    end_ms      INTEGER,
    confidence  REAL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- V2: Full-text search
CREATE VIRTUAL TABLE segments_fts USING fts5(text, content=segments, content_rowid=id);
```

---

## 5. Stack technologique

| Couche          | Technologie                              | Justification                                                                       |
| --------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| Desktop shell   | **Tauri v2** (Rust)                      | Léger (~10 Mo), raccourcis globaux natifs, overlay, system tray, sidecar management |
| Frontend        | **React 19 + Vite**                      | Écosystème mature, composants riches, familiarité développeur                       |
| UI components   | **shadcn/ui + Tailwind CSS**             | Design moderne, accessible, léger, très utilisé en open source                      |
| Backend         | **Python 3.12 + FastAPI**                | Async natif, WebSocket, écosystème ML/audio Python                                  |
| Audio capture   | **sounddevice** (Python)                 | Wrapper PortAudio, cross-platform, simple                                           |
| Transcription   | **vLLM** + Voxtral Mini 4B Realtime      | GPU NVIDIA, endpoint WebSocket `/v1/realtime`, quantification AWQ                   |
| Résumé (V2)     | **llama-cpp-python** + Mistral 7B Q4_K_M | CPU (64 Go RAM), bon en français, même écosystème Mistral                           |
| Base de données | **SQLite** (via aiosqlite)               | Léger, embarqué, FTS5 pour recherche full-text                                      |
| Config          | **config.yaml** (via Pydantic + PyYAML)  | Lisible, validé par schéma, facile à documenter                                     |
| Injection texte | **enigo** (crate Rust)                   | Simulation de frappe cross-platform (Win32 SendInput)                               |
| Python env      | **venv** (standard)                      | Isolation des dépendances, aucune dépendance externe                                |
| Package manager | **uv** ou **pip**                        | uv recommandé pour la vitesse, pip en fallback                                      |

---

## 6. Configuration utilisateur

Fichier `config.yaml` à la racine du projet :

```yaml
# Voice-to-Speech Local — Configuration

language: "fr" # Langue par défaut (fr, en, es, pt, hi, de, nl, it, ar, ru, zh, ja, ko)

shortcuts:
  toggle_dictation: "Ctrl+Shift+D" # Active/désactive le mode dictée
  toggle_transcription: "Ctrl+Shift+T" # Ouvre/focus la fenêtre transcription

models:
  transcription:
    name: "mistralai/Voxtral-Mini-4B-Realtime"
    quantization: "awq" # awq, gptq, bf16
    delay_ms: 480 # Délai streaming (80-2400ms, sweet spot: 480ms)
    vllm_port: 8000
  summarization: # V2
    name: "mistralai/Mistral-7B-Instruct-v0.3"
    quantization: "Q4_K_M"
    device: "cpu"

audio:
  sample_rate: 16000
  channels: 1
  device: "default" # Nom ou index du device audio
  chunk_duration_ms: 80 # Aligné sur 1 token Voxtral = 80ms

overlay:
  enabled: true
  position: "top-right" # top-left, top-right, bottom-left, bottom-right
  opacity: 0.85
  size: "small" # small, medium

storage:
  db_path: "./data/sessions.db"

backend:
  host: "127.0.0.1"
  port: 8001
```

---

## 7. Structure du projet

```
voice-to-speech-local/
├── README.md                           # Guide d'installation et d'utilisation
├── LICENSE                             # Apache 2.0
├── config.yaml                         # Configuration utilisateur
├── config.example.yaml                 # Template de configuration
├── .gitignore
├── .env.example
│
├── backend/                            # Python backend (FastAPI)
│   ├── pyproject.toml                  # Métadonnées projet + dépendances
│   ├── requirements.txt                # Dépendances pip (généré depuis pyproject.toml)
│   ├── src/
│   │   ├── __init__.py
│   │   ├── main.py                     # Entry point FastAPI
│   │   ├── config.py                   # Chargement et validation config.yaml (Pydantic)
│   │   ├── audio/
│   │   │   ├── __init__.py
│   │   │   └── capture.py              # Capture micro (sounddevice)
│   │   ├── transcription/
│   │   │   ├── __init__.py
│   │   │   └── client.py               # Client WebSocket vers vLLM
│   │   ├── summarization/              # V2
│   │   │   ├── __init__.py
│   │   │   └── summarizer.py           # Interface llama-cpp-python
│   │   ├── storage/
│   │   │   ├── __init__.py
│   │   │   ├── database.py             # Init SQLite + migrations
│   │   │   └── repository.py           # CRUD sessions & segments
│   │   └── api/
│   │       ├── __init__.py
│   │       ├── ws.py                   # WebSocket endpoints (audio stream, transcription)
│   │       └── routes.py               # REST endpoints (sessions, config, health)
│   └── tests/
│       ├── __init__.py
│       ├── test_config.py
│       ├── test_audio.py
│       ├── test_storage.py
│       └── test_transcription.py
│
├── frontend/                           # React + Vite
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx                    # Entry point React
│   │   ├── App.tsx                     # Router principal
│   │   ├── components/
│   │   │   ├── TranscriptionView.tsx   # Vue temps réel transcription
│   │   │   ├── SessionList.tsx         # Liste des sessions passées
│   │   │   ├── SessionDetail.tsx       # Détail d'une session
│   │   │   ├── StatusIndicator.tsx     # Indicateur micro/langue
│   │   │   ├── LanguageSelector.tsx    # Sélecteur de langue
│   │   │   └── Settings.tsx            # Page paramètres
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts         # Hook WebSocket vers backend
│   │   │   └── useTranscription.ts     # Hook logique transcription
│   │   ├── lib/
│   │   │   ├── api.ts                  # Client REST backend
│   │   │   └── tauri.ts                # Bridge Tauri IPC
│   │   └── styles/
│   │       └── globals.css             # Tailwind base
│   └── public/
│
├── src-tauri/                          # Tauri v2 (Rust)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/                   # Permissions Tauri v2
│   ├── icons/
│   └── src/
│       ├── main.rs                     # Entry point, setup plugins
│       ├── shortcuts.rs                # Enregistrement raccourcis globaux
│       ├── overlay.rs                  # Gestion fenêtre overlay
│       ├── tray.rs                     # System tray setup
│       ├── injection.rs                # Injection texte (enigo/SendInput)
│       └── sidecar.rs                  # Gestion process Python + vLLM
│
├── scripts/
│   ├── setup.ps1                       # Installation Windows (venv, modèles, build)
│   └── setup.sh                        # Installation Linux/macOS (futur)
│
├── data/                               # Données locales (gitignored)
│   └── sessions.db
│
├── models/                             # Modèles téléchargés (gitignored)
│   └── .gitkeep
│
└── docs/
    └── ARCHITECTURE.md                 # Documentation architecture (généré depuis ce PRD)
```

---

## 8. Plan de développement

### Phase 1 — Fondations (semaine 1-2)

1. Initialiser le projet Tauri v2 + React + Vite
2. Setup backend Python (FastAPI, venv, structure de base)
3. Configurer le chargement de `config.yaml`
   FR(Pydantic)
4. Implémenter la capture audio (sounddevice)
5. Lancer vLLM avec Voxtral Mini 4B en local, valider le WebSocket `/v1/realtime`
6. Premier test end-to-end : micro → vLLM → texte dans la console

### Phase 2 — Mode transcription (semaine 3-4)

7. Implémenter le WebSocket backend ↔ frontend (streaming tokens)
8. Créer l'interface React : vue transcription temps réel
9. Ajouter l'horodatage des segments
10. Implémenter le stockage SQLite (sessions + segments)
11. Créer la liste des sessions passées + vue détail

### Phase 3 — Mode dictée + overlay (semaine 5-6)

12. Implémenter les raccourcis globaux Tauri (Ctrl+Shift+D, Ctrl+Shift+T)
13. Implémenter l'injection de texte au curseur (enigo/SendInput)
14. Créer la fenêtre overlay (transparent, always-on-top)
15. Implémenter le system tray
16. Sélecteur de langue dans l'UI et le tray

### Phase 4.1 — Robustesse & Tests (semaine 7)

17. Gestion d'erreurs robuste (vLLM down, micro indisponible, WebSocket coupé, backend KO)
18. Tests unitaires et d'intégration (config, storage, WebSocket, capture audio mock, flux end-to-end)
19. Health checks : endpoint `/health` backend + vérification périodique côté Tauri

> **Vérification** : les tests passent, l'app se comporte correctement quand on coupe volontairement vLLM, le micro ou le backend.

### Phase 4.2 — Page de paramètres (semaine 7-8)

20. UI Settings : page React avec formulaire (langue, raccourcis, device audio, position overlay, delay streaming)
21. API REST : endpoints `GET /config` et `PUT /config` pour lire/écrire `config.yaml`
22. Application à chaud : certains paramètres (langue, overlay) sans redémarrage ; les autres signalent qu'un redémarrage est nécessaire

> **Vérification** : modifier chaque paramètre via l'UI, vérifier que `config.yaml` est mis à jour et que le changement prend effet.

### Phase 4.3 — Packaging & Release (semaine 8)

23. Script d'installation automatisé (`setup.ps1` : venv, dépendances, modèle, build Tauri)
24. Documentation README complète (prérequis, installation, utilisation, configuration, FAQ)
25. Premier tag de release GitHub (build release, `.msi`/`.exe`, tag Git, release avec assets)

> **Vérification** : suivre le README depuis zéro sur une machine propre, vérifier que le script d'install fonctionne et que l'app tourne.

### Phase 5 — V2

26. Intégration Mistral 7B pour résumés automatiques
27. Recherche full-text (FTS5)
28. Export Markdown/TXT/SRT
29. Diarisation (si modèle disponible)
30. Commandes vocales

---

## 9. Risques et points d'attention

| Risque                                                          | Impact                           | Mitigation                                                                                 |
| --------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------ |
| **VRAM insuffisante** : Voxtral BF16 (8.9 Go) remplit les 16 Go | Crash ou OOM                     | Utiliser la quantification AWQ (~2.5 Go). Tester en charge.                                |
| **Latence audio → texte** trop élevée pour la dictée            | UX dégradée                      | Delay à 480ms. Optimiser le pipeline WebSocket. Mesurer la latence end-to-end.             |
| **Injection texte** non fiable selon l'application cible        | Texte manquant ou mal injecté    | Tester avec les apps courantes (VS Code, Word, navigateur). Fallback presse-papier.        |
| **vLLM Windows** : support Windows parfois instable             | Impossible de lancer l'inference | Tester en WSL2 en fallback. Suivre les issues vLLM. Alternative : voxtral.c si nécessaire. |
| **Qualité transcription** variable selon accent/bruit           | Erreurs de transcription         | Documenter les conditions optimales. Ajouter un gain/noise gate configurable.              |
| **Taille des modèles** : téléchargement initial volumineux      | Friction à l'installation        | Script d'install avec barre de progression. Documenter les prérequis.                      |
| **Sidecar Python** : gestion du cycle de vie du process         | Crash silencieux                 | Health check périodique, redémarrage auto, logs visibles dans l'UI.                        |

---

## 10. Prérequis utilisateur

- **OS** : Windows 10/11 (64-bit)
- **GPU** : NVIDIA avec ≥16 Go VRAM (RTX 4080/4090, RTX 3090, A4000+)
- **RAM** : ≥32 Go (64 Go recommandé pour résumé LLM sur CPU)
- **Disque** : ~20 Go libres (modèles + application)
- **Drivers** : CUDA 12.x + cuDNN
- **Python** : 3.12+
- **Node.js** : 20+
- **Rust** : 1.75+ (pour build Tauri)
