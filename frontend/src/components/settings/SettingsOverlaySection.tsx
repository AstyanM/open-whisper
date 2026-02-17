import { Layers } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

interface Props {
  draft: AppConfig;
  set: <K extends keyof AppConfig>(section: K, patch: Partial<AppConfig[K]>) => void;
}

export function SettingsOverlaySection({ draft, set }: Props) {
  return (
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
  );
}
