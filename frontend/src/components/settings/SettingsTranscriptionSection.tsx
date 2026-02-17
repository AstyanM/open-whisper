import { Zap } from "lucide-react";

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
import { RestartBadge } from "@/components/settings/RestartBadge";
import type { AppConfig } from "@/lib/api";

interface Props {
  draft: AppConfig;
  set: <K extends keyof AppConfig>(section: K, patch: Partial<AppConfig[K]>) => void;
}

export function SettingsTranscriptionSection({ draft, set }: Props) {
  const t = draft.models.transcription;

  /** Convenience to update a single transcription field. */
  function setT(patch: Partial<typeof t>) {
    set("models", { transcription: { ...t, ...patch } });
  }

  return (
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
            value={t.model_size}
            onValueChange={(v) => setT({ model_size: v })}
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
            value={t.device}
            onValueChange={(v) => setT({ device: v as "cuda" | "cpu" | "auto" })}
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
            value={t.compute_type}
            onValueChange={(v) => setT({ compute_type: v })}
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
            value={t.beam_size}
            onChange={(e) => setT({ beam_size: Number(e.target.value) })}
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
            checked={t.vad_filter}
            onCheckedChange={(v) => setT({ vad_filter: v })}
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
            value={t.vad_min_silence_ms ?? 500}
            onChange={(e) => setT({ vad_min_silence_ms: Number(e.target.value) })}
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
              {(t.temperature ?? 0).toFixed(1)}
            </span>
          </div>
          <Slider
            min={0}
            max={1}
            step={0.1}
            value={[t.temperature ?? 0]}
            onValueChange={([v]) => setT({ temperature: v })}
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
              {t.buffer_duration_s}s
            </span>
          </div>
          <Slider
            min={1}
            max={30}
            step={0.5}
            value={[t.buffer_duration_s]}
            onValueChange={([v]) => setT({ buffer_duration_s: v })}
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
              {t.overlap_duration_s}s
            </span>
          </div>
          <Slider
            min={0}
            max={5}
            step={0.5}
            value={[t.overlap_duration_s]}
            onValueChange={([v]) => setT({ overlap_duration_s: v })}
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
            value={t.initial_prompt ?? ""}
            onChange={(e) => setT({ initial_prompt: e.target.value || null })}
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
            value={t.end_padding_ms ?? 300}
            onChange={(e) => setT({ end_padding_ms: Number(e.target.value) })}
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
            value={t.post_roll_ms ?? 1200}
            onChange={(e) => setT({ post_roll_ms: Number(e.target.value) })}
          />
        </div>
      </CardContent>
    </Card>
  );
}
