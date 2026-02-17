import { useCallback, useRef, useState } from "react";
import { Save, RotateCcw, Loader2, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";
import type { AppConfig } from "@/lib/api";

import { SettingsGeneralSection } from "@/components/settings/SettingsGeneralSection";
import { SettingsAudioSection } from "@/components/settings/SettingsAudioSection";
import { SettingsOverlaySection } from "@/components/settings/SettingsOverlaySection";
import { SettingsTranscriptionSection } from "@/components/settings/SettingsTranscriptionSection";
import { SettingsSearchSection } from "@/components/settings/SettingsSearchSection";
import { SettingsAdvancedSection } from "@/components/settings/SettingsAdvancedSection";

export function SettingsPage() {
  const {
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
  } = useSettings();

  const [showSuccess, setShowSuccess] = useState(false);
  const successTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleSave = useCallback(async () => {
    await save();
    setShowSuccess(true);
    clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => setShowSuccess(false), 3000);
  }, [save]);

  if (loading || !draft) {
    return (
      <div className="mx-auto flex max-w-2xl items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  /** Convenience updater for a nested field (object sections only). */
  function set<K extends keyof AppConfig>(
    section: K,
    patch: Partial<AppConfig[K]>,
  ) {
    updateDraft((prev) => ({
      ...prev,
      [section]: { ...(prev[section] as object), ...patch },
    }));
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-20">
      {/* ── Header ─────────────────────────────────────────── */}
      <h2 className="text-xl font-semibold">Settings</h2>

      {/* ── Banners ────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {showSuccess && (
        <div className="rounded-md border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
          Settings saved successfully.
        </div>
      )}
      {saveResult && saveResult.restart_required.length > 0 && (
        <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-400">
          Some changes require a restart to take effect:{" "}
          {saveResult.restart_required.join(", ")}
        </div>
      )}

      {/* ── Sections ───────────────────────────────────────── */}
      <SettingsGeneralSection draft={draft} updateDraft={updateDraft} />
      <SettingsAudioSection draft={draft} devices={devices} set={set} />
      <SettingsOverlaySection draft={draft} set={set} />
      <SettingsTranscriptionSection draft={draft} set={set} />
      <SettingsSearchSection draft={draft} set={set} />
      <SettingsAdvancedSection draft={draft} />

      {/* ── Sticky save bar ────────────────────────────────── */}
      {isDirty && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-sm px-6 py-3 animate-in slide-in-from-bottom duration-200">
          <div className="mx-auto flex max-w-2xl items-center justify-between">
            <span className="text-sm text-muted-foreground">
              You have unsaved changes
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={reset}
                disabled={saving}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
