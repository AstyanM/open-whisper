import { useCallback, useRef, useState } from "react";
import { Save, RotateCcw, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { LanguageSelector } from "@/components/LanguageSelector";
import { MicTest } from "@/components/MicTest";
import { useSettings } from "@/hooks/useSettings";
import type { AppConfig, OverlayConfig } from "@/lib/api";

const OVERLAY_POSITIONS: { value: OverlayConfig["position"]; label: string }[] =
  [
    { value: "top-left", label: "Top Left" },
    { value: "top-right", label: "Top Right" },
    { value: "bottom-left", label: "Bottom Left" },
    { value: "bottom-right", label: "Bottom Right" },
  ];

const OVERLAY_SIZES: { value: OverlayConfig["size"]; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
];

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
  const successTimerRef = useRef<ReturnType<typeof setTimeout>>();

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

  /** Convenience updater for a nested field. */
  function set<K extends keyof AppConfig>(
    section: K,
    patch: Partial<AppConfig[K]>,
  ) {
    updateDraft((prev) => ({
      ...prev,
      [section]: { ...prev[section], ...patch },
    }));
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Settings</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={reset}
            disabled={!isDirty || saving}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!isDirty || saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      </div>

      {/* ── Banners ────────────────────────────────────────── */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {showSuccess && (
        <div className="rounded-md border border-green-500/50 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
          Settings saved successfully.
        </div>
      )}
      {saveResult && saveResult.restart_required.length > 0 && (
        <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-700 dark:text-yellow-400">
          Some changes require a restart to take effect:{" "}
          {saveResult.restart_required.join(", ")}
        </div>
      )}

      {/* ── General ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Language and keyboard shortcuts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Language</Label>
            <LanguageSelector
              value={draft.language}
              onChange={(v) => updateDraft((p) => ({ ...p, language: v }))}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-muted-foreground">Toggle dictation</Label>
            <span className="rounded bg-muted px-2 py-1 text-xs font-mono">
              {draft.shortcuts.toggle_dictation}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-muted-foreground">
              Toggle transcription
            </Label>
            <span className="rounded bg-muted px-2 py-1 text-xs font-mono">
              {draft.shortcuts.toggle_transcription}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Audio ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Audio</CardTitle>
          <CardDescription>
            Microphone and capture settings. Device changes require a restart.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Input device</Label>
            <Select
              value={draft.audio.device}
              onValueChange={(v) => set("audio", { device: v })}
            >
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="Select device" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                {devices.map((d) => (
                  <SelectItem key={d.index} value={d.name}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label>Chunk duration (ms)</Label>
            <Input
              type="number"
              className="w-24"
              min={20}
              max={500}
              value={draft.audio.chunk_duration_ms}
              onChange={(e) =>
                set("audio", { chunk_duration_ms: Number(e.target.value) })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-muted-foreground">Sample rate</Label>
            <span className="text-sm text-muted-foreground">
              {draft.audio.sample_rate} Hz
            </span>
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-muted-foreground">Channels</Label>
            <span className="text-sm text-muted-foreground">
              {draft.audio.channels === 1 ? "Mono" : "Stereo"}
            </span>
          </div>

          <div className="border-t pt-4">
            <MicTest device={draft.audio.device} />
          </div>
        </CardContent>
      </Card>

      {/* ── Overlay ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Overlay</CardTitle>
          <CardDescription>
            Floating indicator showing microphone state.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Enabled</Label>
            <Switch
              checked={draft.overlay.enabled}
              onCheckedChange={(v) => set("overlay", { enabled: v })}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label>Position</Label>
            <Select
              value={draft.overlay.position}
              onValueChange={(v) =>
                set("overlay", {
                  position: v as OverlayConfig["position"],
                })
              }
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OVERLAY_POSITIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Opacity</Label>
              <span className="text-sm text-muted-foreground">
                {Math.round(draft.overlay.opacity * 100)}%
              </span>
            </div>
            <Slider
              min={10}
              max={100}
              step={5}
              value={[Math.round(draft.overlay.opacity * 100)]}
              onValueChange={([v]) => set("overlay", { opacity: v / 100 })}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label>Size</Label>
            <Select
              value={draft.overlay.size}
              onValueChange={(v) =>
                set("overlay", { size: v as OverlayConfig["size"] })
              }
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OVERLAY_SIZES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ── Streaming ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Streaming</CardTitle>
          <CardDescription>
            Transcription streaming parameters.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Delay (ms)</Label>
              <p className="text-xs text-muted-foreground">
                480 ms recommended
              </p>
            </div>
            <Input
              type="number"
              className="w-24"
              min={80}
              max={2400}
              value={draft.models.transcription.delay_ms}
              onChange={(e) =>
                set("models", {
                  transcription: {
                    ...draft.models.transcription,
                    delay_ms: Number(e.target.value),
                  },
                })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>vLLM port</Label>
              <p className="text-xs text-muted-foreground">
                Port change requires restart
              </p>
            </div>
            <Input
              type="number"
              className="w-24"
              min={1}
              max={65535}
              value={draft.models.transcription.vllm_port}
              onChange={(e) =>
                set("models", {
                  transcription: {
                    ...draft.models.transcription,
                    vllm_port: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Advanced (read-only) ───────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Advanced</CardTitle>
          <CardDescription>
            Read-only values. Edit config.yaml directly to change these.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoRow label="Backend" value={`${draft.backend.host}:${draft.backend.port}`} />
          <InfoRow label="Database" value={draft.storage.db_path} />
          <InfoRow label="Model" value={draft.models.transcription.name} />
          <InfoRow label="Quantization" value={draft.models.transcription.quantization} />
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="rounded bg-muted px-2 py-1 text-xs font-mono">
        {value}
      </span>
    </div>
  );
}
