import { AudioLines } from "lucide-react";

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
import { MicTest } from "@/components/MicTest";
import { RestartBadge } from "@/components/settings/RestartBadge";
import type { AppConfig, AudioDevice } from "@/lib/api";

interface Props {
  draft: AppConfig;
  devices: AudioDevice[];
  set: <K extends keyof AppConfig>(section: K, patch: Partial<AppConfig[K]>) => void;
}

export function SettingsAudioSection({ draft, devices, set }: Props) {
  return (
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
                <SelectItem key={d.index} value={String(d.index)}>
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
  );
}
