import { useEffect, useRef } from "react";
import { Loader2, Mic } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatDurationMs } from "@/lib/format";
import type { TranscriptionState } from "@/hooks/useTranscription";

interface TranscriptionViewProps {
  text: string;
  state: TranscriptionState;
  elapsedMs: number;
  modelLabel?: string | null;
}

export function TranscriptionView({
  text,
  state,
  elapsedMs,
  modelLabel,
}: TranscriptionViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text]);

  const isRecording = state === "recording";
  const isFinalizing = state === "finalizing";
  const isConnecting = state === "connecting";
  const isLoadingModel = state === "loading_model";
  const isActive = isRecording || isFinalizing;
  const isLoading = isConnecting || isLoadingModel;
  const showDuration = elapsedMs > 0;

  return (
    <Card
      className={cn(
        "!py-0 !gap-0",
        isActive && "ring-2 ring-amber-500/20 glow-amber",
        isLoading && "ring-2 ring-amber-500/10",
      )}
    >
      <CardContent className="p-0">
        <div
          ref={scrollRef}
          className="h-[400px] overflow-y-auto px-4 pt-1.5 pb-3"
        >
          {(modelLabel || showDuration) && (
            <div className="mb-3 flex items-center justify-between">
              {modelLabel ? (
                <span className="font-mono text-xs text-muted-foreground/50">{modelLabel}</span>
              ) : <span />}
              {showDuration && (
                <Badge variant="secondary">{formatDurationMs(elapsedMs)}</Badge>
              )}
            </div>
          )}
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {text || (
              <>
                {isLoading ? (
                  /* Model loading state */
                  <div className="flex flex-col items-center justify-center gap-4 pt-28">
                    <div className="rounded-full bg-amber-500/10 p-4">
                      <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
                    </div>
                    <span className="text-muted-foreground">
                      {isLoadingModel ? "Loading Whisper model..." : "Connecting..."}
                    </span>
                    <Progress className="w-48" />
                  </div>
                ) : isFinalizing ? (
                  /* Finalizing state */
                  <div className="flex flex-col items-center justify-center gap-4 pt-28">
                    <div className="rounded-full bg-amber-500/10 p-4">
                      <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
                    </div>
                    <span className="text-muted-foreground">
                      Finalizing transcription...
                    </span>
                  </div>
                ) : isRecording ? (
                  /* Recording but no text yet */
                  <div className="flex flex-col items-center justify-center gap-3 pt-28">
                    <div className="rounded-full bg-amber-500/10 p-4">
                      <Mic className="h-8 w-8 text-amber-500 animate-pulse" />
                    </div>
                    <span className="text-muted-foreground">Listening...</span>
                  </div>
                ) : (
                  /* Idle empty state */
                  <div className="flex flex-col items-center justify-center gap-3 pt-28 text-center">
                    <div className="rounded-full bg-amber-500/10 p-4">
                      <Mic className="h-8 w-8 text-amber-500/60" />
                    </div>
                    <p className="text-muted-foreground">
                      Click <strong>Start</strong> or press{" "}
                      <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono font-medium">
                        Ctrl+Shift+T
                      </kbd>{" "}
                      to begin
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
