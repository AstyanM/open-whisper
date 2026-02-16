import { useState, useEffect, useCallback, useMemo, useRef } from "react";

import {
  fetchFullConfig,
  updateConfig,
  fetchAudioDevices,
} from "@/lib/api";
import type { AppConfig, AudioDevice, UpdateConfigResult } from "@/lib/api";
import { emitEvent, setWindowVisible } from "@/lib/tauri";

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

  // Overlay is auto-saved live, so exclude it from the dirty check
  const isDirty = useMemo(() => {
    if (!config || !draft) return false;
    const { overlay: _co, ...configRest } = config;
    const { overlay: _do, ...draftRest } = draft;
    return JSON.stringify(configRest) !== JSON.stringify(draftRest);
  }, [config, draft]);

  // Live-apply + auto-save overlay changes (no Save button needed)
  const prevOverlayJsonRef = useRef("");
  useEffect(() => {
    if (!draft || !config) return;
    const overlayJson = JSON.stringify(draft.overlay);
    // Initialize on first render — don't trigger
    if (!prevOverlayJsonRef.current) {
      prevOverlayJsonRef.current = overlayJson;
      return;
    }
    // No change
    if (overlayJson === prevOverlayJsonRef.current) return;
    prevOverlayJsonRef.current = overlayJson;

    // 1. Live preview via Tauri event
    emitEvent("overlay-config-changed", draft.overlay);
    // 2. Show/hide overlay window
    setWindowVisible("overlay", draft.overlay.enabled);
    // 3. Auto-persist overlay to backend
    const toSave = { ...config, overlay: draft.overlay };
    updateConfig(toSave)
      .then(() => {
        setConfig((prev) =>
          prev ? { ...prev, overlay: structuredClone(draft.overlay) } : prev,
        );
      })
      .catch(() => {});
  }, [draft, config]);

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
      // Note: overlay events are handled live via the dedicated useEffect
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
