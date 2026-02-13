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
    vllm?: { status: string; message?: string };
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
