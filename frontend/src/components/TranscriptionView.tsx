import { useEffect, useRef } from "react";
import { Mic } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TranscriptionState } from "@/hooks/useTranscription";

interface TranscriptionViewProps {
  text: string;
  state: TranscriptionState;
  elapsedMs: number;
  modelLabel?: string | null;
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
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
  const isActive = isRecording || isFinalizing;
  const showDuration = elapsedMs > 0;

  return (
    <Card
      className={cn(
        "!py-0 !gap-0",
        isActive && "ring-2 ring-amber-500/20 glow-amber",
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
                <Badge variant="secondary">{formatDuration(elapsedMs)}</Badge>
              )}
            </div>
          )}
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {text || (
              <span className="flex flex-col items-center justify-center gap-2 pt-32 text-muted-foreground italic">
                <Mic className="h-8 w-8 opacity-30" />
                {state === "idle"
                  ? "Click Start to begin transcription..."
                  : "Waiting for speech..."}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
