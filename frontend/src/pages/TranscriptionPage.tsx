import { Mic, Square, Keyboard, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StatusIndicator } from "@/components/StatusIndicator";
import { LanguageSelector } from "@/components/LanguageSelector";
import { TranscriptionView } from "@/components/TranscriptionView";
import { useTranscriptionContext } from "@/contexts/TranscriptionContext";

export function TranscriptionPage() {
  const {
    language,
    setLanguage,
    transcription,
    dictation,
    isTranscribing,
    isDictating,
    isActive,
  } = useTranscriptionContext();

  const { state, start, resume, stop, liveText, error, elapsedMs, device } = transcription;
  const hasText = liveText.length > 0;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between rounded-lg bg-secondary/30 px-4 py-3">
        <div className="flex items-center gap-4">
          <StatusIndicator state={isDictating ? dictation.state : state} device={isDictating ? dictation.device : device} />
          {isDictating && (
            <Badge variant="dictation">
              <Keyboard className="mr-1 h-3 w-3" />
              Dictation
            </Badge>
          )}
          {isTranscribing && (
            <Badge variant="transcription">
              <Mic className="mr-1 h-3 w-3" />
              Transcription
            </Badge>
          )}
          <Separator orientation="vertical" className="h-6" />
          <LanguageSelector
            value={language}
            onChange={setLanguage}
            disabled={isActive}
          />
        </div>

        {isTranscribing ? (
          <Button
            variant="destructive"
            onClick={stop}
            disabled={state === "finalizing"}
          >
            <Square className="mr-2 h-4 w-4" />
            Stop
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            {hasText && (
              <Button onClick={() => resume(language)} disabled={isDictating}>
                <Play className="mr-2 h-4 w-4" />
                Continue
              </Button>
            )}
            <Button
              variant={hasText ? "outline" : "default"}
              onClick={() => start(language)}
              disabled={isDictating}
            >
              <Mic className="mr-2 h-4 w-4" />
              {hasText ? "New" : "Start"}
            </Button>
          </div>
        )}
      </div>

      {/* Transcription display */}
      <TranscriptionView text={liveText} state={state} elapsedMs={elapsedMs} />

      {/* Error display */}
      {(error || dictation.error) && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error || dictation.error}
        </div>
      )}
    </div>
  );
}
