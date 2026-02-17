import { useCallback, useRef, useState } from "react";
import {
  Save,
  RotateCcw,
  Loader2,
  Globe,
  AudioLines,
  Layers,
  Search,
  Zap,
  Wrench,
  AlertCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

function RestartBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className="ml-2 text-[10px] text-yellow-600 dark:text-yellow-400 border-yellow-500/30"
        >
          Restart
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Changing this requires a restart to take effect</TooltipContent>
    </Tooltip>
  );
}

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

      {/* ── General ────────────────────────────────────────── */}
      <Card className="border-accent-top">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            General
          </CardTitle>
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label>Max upload size</Label>
                <p className="text-xs text-muted-foreground">
                  Maximum file size for audio upload
                </p>
              </div>
              <span className="text-sm text-muted-foreground">
                {draft.max_upload_size_mb >= 1024
                  ? "1 GB"
                  : `${draft.max_upload_size_mb} MB`}
              </span>
            </div>
            <Slider
              min={50}
              max={1024}
              step={50}
              value={[draft.max_upload_size_mb]}
              onValueChange={([v]) =>
                updateDraft((p) => ({ ...p, max_upload_size_mb: v }))
              }
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
      <Card className="border-accent-top">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AudioLines className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            Audio
          </CardTitle>
          <CardDescription>
            Microphone and capture settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Label>Input device</Label>
              <RestartBadge />
            </div>
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
            <div className="flex items-center">
              <Label>Chunk duration (ms)</Label>
              <RestartBadge />
            </div>
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
      <Card className="border-accent-top">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            Overlay
          </CardTitle>
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

          <div className="border-t pt-4 space-y-3">
            <Label className="text-muted-foreground text-xs uppercase tracking-wide">
              Display elements
            </Label>
            <div className="flex items-center justify-between">
              <Label>Show language</Label>
              <Switch
                checked={draft.overlay.show_language}
                onCheckedChange={(v) => set("overlay", { show_language: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Show active mode</Label>
              <Switch
                checked={draft.overlay.show_mode}
                onCheckedChange={(v) => set("overlay", { show_mode: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Show recording duration</Label>
              <Switch
                checked={draft.overlay.show_duration}
                onCheckedChange={(v) => set("overlay", { show_duration: v })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Transcription ───────────────────────────────────── */}
      <Card className="border-accent-top">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            Transcription
          </CardTitle>
          <CardDescription>
            Whisper model and transcription parameters.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Label>Model size</Label>
              <RestartBadge />
            </div>
            <Select
              value={draft.models.transcription.model_size}
              onValueChange={(v) =>
                set("models", {
                  transcription: {
                    ...draft.models.transcription,
                    model_size: v,
                  },
                })
              }
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (GPU: Turbo, CPU: Small)</SelectItem>
                <SelectItem value="tiny">Tiny (~1 GB)</SelectItem>
                <SelectItem value="base">Base (~1 GB)</SelectItem>
                <SelectItem value="small">Small (~2 GB)</SelectItem>
                <SelectItem value="medium">Medium (~5 GB)</SelectItem>
                <SelectItem value="large-v3-turbo">Large V3 Turbo (~6 GB)</SelectItem>
                <SelectItem value="large-v3">Large V3 (~6 GB, slower but more accurate)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Label>Device</Label>
              <RestartBadge />
            </div>
            <Select
              value={draft.models.transcription.device}
              onValueChange={(v) =>
                set("models", {
                  transcription: {
                    ...draft.models.transcription,
                    device: v as "cuda" | "cpu" | "auto",
                  },
                })
              }
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="cuda">CUDA (GPU)</SelectItem>
                <SelectItem value="cpu">CPU</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Label>Compute type</Label>
              <RestartBadge />
            </div>
            <Select
              value={draft.models.transcription.compute_type}
              onValueChange={(v) =>
                set("models", {
                  transcription: {
                    ...draft.models.transcription,
                    compute_type: v,
                  },
                })
              }
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="float16">Float16</SelectItem>
                <SelectItem value="int8">Int8</SelectItem>
                <SelectItem value="int8_float16">Int8 + Float16</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Beam size</Label>
              <p className="text-xs text-muted-foreground">
                1 = greedy (fast), 5 = beam search (accurate)
              </p>
            </div>
            <Input
              type="number"
              className="w-24"
              min={1}
              max={20}
              value={draft.models.transcription.beam_size}
              onChange={(e) =>
                set("models", {
                  transcription: {
                    ...draft.models.transcription,
                    beam_size: Number(e.target.value),
                  },
                })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>VAD filter</Label>
              <p className="text-xs text-muted-foreground">
                Skip silent regions for faster transcription
              </p>
            </div>
            <Switch
              checked={draft.models.transcription.vad_filter}
              onCheckedChange={(v) =>
                set("models", {
                  transcription: {
                    ...draft.models.transcription,
                    vad_filter: v,
                  },
                })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>VAD min silence</Label>
              <p className="text-xs text-muted-foreground">
                Minimum silence (ms) for VAD to split segments
              </p>
            </div>
            <Input
              type="number"
              className="w-24"
              min={100}
              max={3000}
              step={50}
              value={draft.models.transcription.vad_min_silence_ms ?? 500}
              onChange={(e) =>
                set("models", {
                  transcription: {
                    ...draft.models.transcription,
                    vad_min_silence_ms: Number(e.target.value),
                  },
                })
              }
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label>Temperature</Label>
                <p className="text-xs text-muted-foreground">
                  0 = deterministic (faster), higher = more creative
                </p>
              </div>
              <span className="text-sm text-muted-foreground">
                {(draft.models.transcription.temperature ?? 0).toFixed(1)}
              </span>
            </div>
            <Slider
              min={0}
              max={1}
              step={0.1}
              value={[draft.models.transcription.temperature ?? 0]}
              onValueChange={([v]) =>
                set("models", {
                  transcription: {
                    ...draft.models.transcription,
                    temperature: v,
                  },
                })
              }
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label>Buffer duration</Label>
                <p className="text-xs text-muted-foreground">
                  Seconds of audio to accumulate before transcribing
                </p>
              </div>
              <span className="text-sm text-muted-foreground">
                {draft.models.transcription.buffer_duration_s}s
              </span>
            </div>
            <Slider
              min={1}
              max={30}
              step={0.5}
              value={[draft.models.transcription.buffer_duration_s]}
              onValueChange={([v]) =>
                set("models", {
                  transcription: {
                    ...draft.models.transcription,
                    buffer_duration_s: v,
                  },
                })
              }
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label>Audio overlap</Label>
                <p className="text-xs text-muted-foreground">
                  Seconds of overlap between chunks to avoid cut words
                </p>
              </div>
              <span className="text-sm text-muted-foreground">
                {draft.models.transcription.overlap_duration_s}s
              </span>
            </div>
            <Slider
              min={0}
              max={5}
              step={0.5}
              value={[draft.models.transcription.overlap_duration_s]}
              onValueChange={([v]) =>
                set("models", {
                  transcription: {
                    ...draft.models.transcription,
                    overlap_duration_s: v,
                  },
                })
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Initial prompt</Label>
            <p className="text-xs text-muted-foreground">
              Prime the model with a text hint (e.g. French text to avoid
              code-switching). Leave empty for automatic context chaining.
            </p>
            <Input
              placeholder="e.g. Bonjour, ceci est une transcription en français."
              value={draft.models.transcription.initial_prompt ?? ""}
              onChange={(e) =>
                set("models", {
                  transcription: {
                    ...draft.models.transcription,
                    initial_prompt: e.target.value || null,
                  },
                })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>End padding</Label>
              <p className="text-xs text-muted-foreground">
                Silence appended before transcription to avoid truncation (ms)
              </p>
            </div>
            <Input
              type="number"
              className="w-24"
              min={0}
              max={1000}
              step={50}
              value={draft.models.transcription.end_padding_ms ?? 300}
              onChange={(e) =>
                set("models", {
                  transcription: {
                    ...draft.models.transcription,
                    end_padding_ms: Number(e.target.value),
                  },
                })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Post-roll</Label>
              <p className="text-xs text-muted-foreground">
                Extra audio capture after stop to avoid cutting last words (ms)
              </p>
            </div>
            <Input
              type="number"
              className="w-24"
              min={0}
              max={5000}
              step={100}
              value={draft.models.transcription.post_roll_ms ?? 1200}
              onChange={(e) =>
                set("models", {
                  transcription: {
                    ...draft.models.transcription,
                    post_roll_ms: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Search ─────────────────────────────────────────── */}
      <Card className="border-accent-top">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            Search
          </CardTitle>
          <CardDescription>
            Semantic search relevance settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label>Distance threshold</Label>
                <p className="text-xs text-muted-foreground">
                  Maximum cosine distance for results. Lower = stricter filtering.
                </p>
              </div>
              <span className="text-sm text-muted-foreground">
                {draft.search.distance_threshold.toFixed(2)}
              </span>
            </div>
            <Slider
              min={0.1}
              max={1.5}
              step={0.05}
              value={[draft.search.distance_threshold]}
              onValueChange={([v]) => set("search", { distance_threshold: v })}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground/60">
              <span>Strict (0.1)</span>
              <span>Permissive (1.5)</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-muted-foreground">Embedding model</Label>
            <span className="rounded bg-muted px-2 py-1 text-xs font-mono truncate max-w-[300px]">
              {draft.search.embedding_model}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Advanced (read-only) ───────────────────────────── */}
      <Card className="border-accent-top">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            Advanced
          </CardTitle>
          <CardDescription>
            Read-only values. Edit config.yaml directly to change these.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoRow label="Backend" value={`${draft.backend.host}:${draft.backend.port}`} />
          <InfoRow label="Database" value={draft.storage.db_path} />
        </CardContent>
      </Card>

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
