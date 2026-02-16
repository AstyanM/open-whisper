import { BACKEND_URL } from "./constants";

export interface SessionSummary {
  id: number;
  mode: string;
  language: string;
  started_at: string;
  ended_at: string | null;
  duration_s: number | null;
  created_at: string;
}

export interface Segment {
  id: number;
  text: string;
  start_ms: number;
  end_ms: number | null;
  confidence: number | null;
}

export interface SessionDetail {
  session: SessionSummary;
  segments: Segment[];
  full_text: string;
}

export interface HealthResponse {
  status: string;
  service: string;
  checks: {
    database?: { status: string; message?: string };
    transcription?: { status: string; engine?: string; model?: string; device?: string; loaded?: boolean; message?: string };
    audio?: { status: string; input_devices?: number; message?: string };
  };
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${BACKEND_URL}/health`);
  if (!res.ok) throw new Error("Backend unreachable");
  return res.json();
}

export async function fetchSessions(
  limit = 50,
  offset = 0,
): Promise<SessionSummary[]> {
  const res = await fetch(
    `${BACKEND_URL}/api/sessions?limit=${limit}&offset=${offset}`,
  );
  if (!res.ok) throw new Error("Failed to fetch sessions");
  const data = await res.json();
  return data.sessions;
}

export async function fetchSession(id: number): Promise<SessionDetail> {
  const res = await fetch(`${BACKEND_URL}/api/sessions/${id}`);
  if (!res.ok) throw new Error("Failed to fetch session");
  return res.json();
}

export async function deleteSession(id: number): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/sessions/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete session");
}

export interface SearchFilters {
  q?: string;
  language?: string;
  mode?: string;
  date_from?: string;
  date_to?: string;
  duration_min?: number;
  duration_max?: number;
  limit?: number;
  offset?: number;
}

export async function searchSessions(
  filters: SearchFilters,
): Promise<SessionSummary[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value != null && value !== "") {
      params.set(key, String(value));
    }
  }
  const res = await fetch(
    `${BACKEND_URL}/api/sessions/search?${params}`,
  );
  if (!res.ok) throw new Error("Failed to search sessions");
  const data = await res.json();
  return data.sessions;
}

// ── Config types ───────────────────────────────────────────────────

export interface ShortcutsConfig {
  toggle_dictation: string;
  toggle_transcription: string;
}

export interface TranscriptionModelConfig {
  model_size: string;
  device: "cuda" | "cpu" | "auto";
  compute_type: string;
  beam_size: number;
  vad_filter: boolean;
  buffer_duration_s: number;
  initial_prompt: string | null;
  overlap_duration_s: number;
}

export interface ModelsConfig {
  transcription: TranscriptionModelConfig;
}

export interface AudioConfig {
  sample_rate: number;
  channels: number;
  device: string;
  chunk_duration_ms: number;
}

export interface OverlayConfig {
  enabled: boolean;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  opacity: number;
  size: "small" | "medium";
  show_language: boolean;
  show_mode: boolean;
  show_duration: boolean;
}

export interface StorageConfig {
  db_path: string;
}

export interface BackendConfig {
  host: string;
  port: number;
}

export interface AppConfig {
  language: string;
  shortcuts: ShortcutsConfig;
  models: ModelsConfig;
  audio: AudioConfig;
  overlay: OverlayConfig;
  storage: StorageConfig;
  backend: BackendConfig;
}

export interface AudioDevice {
  index: number;
  name: string;
  channels: number;
  sample_rate: number;
}

export interface UpdateConfigResult {
  status: string;
  applied: string[];
  restart_required: string[];
}

// ── Config API ─────────────────────────────────────────────────────

export async function fetchFullConfig(): Promise<AppConfig> {
  const res = await fetch(`${BACKEND_URL}/api/config`);
  if (!res.ok) throw new Error("Failed to fetch config");
  return res.json();
}

export async function updateConfig(
  config: Partial<AppConfig>,
): Promise<UpdateConfigResult> {
  const res = await fetch(`${BACKEND_URL}/api/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to update config" }));
    throw new Error(err.detail ?? "Failed to update config");
  }
  return res.json();
}

export async function fetchAudioDevices(): Promise<AudioDevice[]> {
  const res = await fetch(`${BACKEND_URL}/api/audio/devices`);
  if (!res.ok) throw new Error("Failed to fetch audio devices");
  const data = await res.json();
  return data.devices;
}
