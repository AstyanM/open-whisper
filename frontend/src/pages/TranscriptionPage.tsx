import { useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatusIndicator } from "@/components/StatusIndicator";
import { LanguageSelector } from "@/components/LanguageSelector";
import { TranscriptionView } from "@/components/TranscriptionView";
import { useTranscription } from "@/hooks/useTranscription";
import { DEFAULT_LANGUAGE } from "@/lib/constants";

export function TranscriptionPage() {
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const { state, start, stop, liveText, error, elapsedMs } =
    useTranscription();

  const isActive = state !== "idle" && state !== "error";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <StatusIndicator state={state} />
          <Separator orientation="vertical" className="h-6" />
          <LanguageSelector
            value={language}
            onChange={setLanguage}
            disabled={isActive}
          />
        </div>

        {isActive ? (
          <Button
            variant="destructive"
            onClick={stop}
            disabled={state === "finalizing"}
          >
            <Square className="mr-2 h-4 w-4" />
            Stop
          </Button>
        ) : (
          <Button onClick={() => start(language)}>
            <Mic className="mr-2 h-4 w-4" />
            Start
          </Button>
        )}
      </div>

      {/* Transcription display */}
      <TranscriptionView text={liveText} state={state} elapsedMs={elapsedMs} />

      {/* Error display */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
