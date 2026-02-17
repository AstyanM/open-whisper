import { Globe } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { LanguageSelector } from "@/components/LanguageSelector";
import type { AppConfig } from "@/lib/api";

interface Props {
  draft: AppConfig;
  updateDraft: (updater: (prev: AppConfig) => AppConfig) => void;
}

export function SettingsGeneralSection({ draft, updateDraft }: Props) {
  return (
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
  );
}
