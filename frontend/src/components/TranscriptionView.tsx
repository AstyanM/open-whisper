import { useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TranscriptionState } from "@/hooks/useTranscription";

interface TranscriptionViewProps {
  text: string;
  state: TranscriptionState;
  elapsedMs: number;
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
}: TranscriptionViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text]);

  const isRecording = state === "recording";
  const isFinalizing = state === "finalizing";
  const showDuration = elapsedMs > 0;

  return (
    <Card>
      <CardContent className="p-0">
        {showDuration && (
          <div className="flex justify-end px-4 pt-3">
            <Badge variant="secondary">{formatDuration(elapsedMs)}</Badge>
          </div>
        )}
        <div
          ref={scrollRef}
          className="h-[400px] overflow-y-auto px-4 py-3"
        >
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {text || (
              <span className="text-muted-foreground italic">
                {state === "idle"
                  ? "Click Start to begin transcription..."
                  : "Waiting for speech..."}
              </span>
            )}
            {(isRecording || isFinalizing) && (
              <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary" />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
