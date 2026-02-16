import { useState, useEffect, useCallback, useMemo } from "react";

import {
  fetchFullConfig,
  updateConfig,
  fetchAudioDevices,
} from "@/lib/api";
import type { AppConfig, AudioDevice, UpdateConfigResult } from "@/lib/api";
import { emitEvent } from "@/lib/tauri";

export interface UseSettingsReturn {
  /** Server-side config (last fetched). */
  config: AppConfig | null;
  /** Local draft the user edits. */
  draft: AppConfig | null;
  /** Available audio input devices. */
  devices: AudioDevice[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  /** Result from the last save operation. */
  saveResult: UpdateConfigResult | null;
  /** Replace a section of the draft. */
  updateDraft: (updater: (prev: AppConfig) => AppConfig) => void;
  /** Persist draft to backend. */
  save: () => Promise<void>;
  /** Revert draft to server config. */
  reset: () => void;
  /** Whether the draft differs from the server config. */
  isDirty: boolean;
}

export function useSettings(): UseSettingsReturn {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [draft, setDraft] = useState<AppConfig | null>(null);
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<UpdateConfigResult | null>(null);

  // Fetch config + devices on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cfg, devs] = await Promise.all([
          fetchFullConfig(),
          fetchAudioDevices().catch(() => [] as AudioDevice[]),
        ]);
        if (cancelled) return;
        setConfig(cfg);
        setDraft(structuredClone(cfg));
        setDevices(devs);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isDirty = useMemo(
    () => JSON.stringify(config) !== JSON.stringify(draft),
    [config, draft],
  );

  const updateDraft = useCallback(
    (updater: (prev: AppConfig) => AppConfig) => {
      setDraft((prev) => (prev ? updater(prev) : prev));
      setSaveResult(null);
    },
    [],
  );

  const reset = useCallback(() => {
    if (config) {
      setDraft(structuredClone(config));
      setSaveResult(null);
    }
  }, [config]);

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setSaveResult(null);
    try {
      const result = await updateConfig(draft);
      setSaveResult(result);

      // Reload config from backend to stay in sync
      const freshConfig = await fetchFullConfig();
      setConfig(freshConfig);
      setDraft(structuredClone(freshConfig));

      // Emit Tauri events for hot-reload sync
      if (config && freshConfig.language !== config.language) {
        await emitEvent("language-changed", freshConfig.language);
      }
      if (
        config &&
        JSON.stringify(freshConfig.overlay) !== JSON.stringify(config.overlay)
      ) {
        await emitEvent("overlay-config-changed", freshConfig.overlay);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [draft, config]);

  return {
    config,
    draft,
    devices,
    loading,
    saving,
    error,
    saveResult,
    updateDraft,
    save,
    reset,
    isDirty,
  };
}
