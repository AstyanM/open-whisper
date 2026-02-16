import { useState, useEffect, useCallback } from "react";
import { fetchHealth } from "@/lib/api";

export type BackendStatus =
  | "unknown"
  | "healthy"
  | "degraded"
  | "unhealthy"
  | "unreachable";

export interface HealthChecks {
  database?: { status: string; message?: string };
  transcription?: { status: string; engine?: string; model?: string; message?: string };
  audio?: { status: string; input_devices?: number; message?: string };
}

export function useBackendHealth(intervalMs = 15000) {
  const [status, setStatus] = useState<BackendStatus>("unknown");
  const [checks, setChecks] = useState<HealthChecks>({});
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const refresh = useCallback(() => {
    fetchHealth()
      .then((data) => {
        setStatus(data.status as BackendStatus);
        setChecks(data.checks ?? {});
        setLastChecked(new Date());
      })
      .catch(() => {
        setStatus("unreachable");
        setChecks({});
        setLastChecked(new Date());
      });
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { status, checks, lastChecked, refresh };
}
