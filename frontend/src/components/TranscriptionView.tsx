import { useEffect, useRef, useState } from "react";
import { Check, Copy, FileAudio, Loader2, Mic, Upload } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatDurationMs } from "@/lib/format";
import type { TranscriptionState } from "@/hooks/useTranscription";
import type { FileTranscriptionState } from "@/hooks/useFileTranscription";

type ViewState = TranscriptionState | FileTranscriptionState;

interface TranscriptionViewProps {
  text: string;
  state: ViewState;
  elapsedMs: number;
  modelLabel?: string | null;
  progress?: number; // 0-100, for file transcription
}

export function TranscriptionView({
  text,
  state,
  elapsedMs,
  modelLabel,
  progress,
}: TranscriptionViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text]);

  async function handleCopy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail (permissions, non-secure context)
    }
  }

  const isRecording = state === "recording";
  const isFinalizing = state === "finalizing";
  const isConnecting = state === "connecting";
  const isLoadingModel = state === "loading_model";
  const isUploading = state === "uploading";
  const isTranscribing = state === "transcribing";
  const isCompleted = state === "completed";

  const isLiveActive = isRecording || isFinalizing;
  const isFileActive = isTranscribing || isUploading;
  const isLoading = isConnecting || isLoadingModel;
  const showDuration = elapsedMs > 0;
  const isFileMode = isUploading || isTranscribing || isCompleted;

  return (
    <Card
      className={cn(
        "!py-0 !gap-0",
        isLiveActive && "ring-2 ring-amber-500/20 glow-amber",
        isFileActive && "ring-2 ring-sky-500/20",
        isLoading && !isFileMode && "ring-2 ring-amber-500/10",
        isLoading && isFileMode && "ring-2 ring-sky-500/10",
        isFinalizing && isFileMode && "ring-2 ring-sky-500/10",
      )}
    >
      <CardContent className="p-0">
        <div
          ref={scrollRef}
          className="h-[400px] overflow-y-auto px-4 pt-1.5 pb-3"
        >
          {(modelLabel || showDuration || text || (isTranscribing && progress != null && progress > 0)) && (
            <div className="mb-3 flex items-center justify-between gap-3">
              {modelLabel ? (
                <span className="font-mono text-xs text-muted-foreground/50">{modelLabel}</span>
              ) : isTranscribing && progress != null ? (
                <div className="flex-1 flex items-center gap-2">
                  <Progress value={progress} className="h-1.5 flex-1" />
                  <span className="font-mono text-xs text-muted-foreground/50 shrink-0">
                    {Math.round(progress)}%
                  </span>
                </div>
              ) : <span />}
              <div className="flex items-center gap-1.5">
                {showDuration && (
                  <Badge variant="secondary">{formatDurationMs(elapsedMs)}</Badge>
                )}
                {text && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleCopy}>
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{copied ? "Copied!" : "Copy text"}</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          )}
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {text || (
              <>
                {isUploading ? (
                  /* Uploading file */
                  <div className="flex flex-col items-center justify-center gap-4 pt-28">
                    <div className="rounded-full bg-sky-500/10 p-4">
                      <Upload className="h-8 w-8 text-sky-500 animate-pulse" />
                    </div>
                    <span className="text-muted-foreground">Uploading file...</span>
                    <Progress className="w-48" />
                  </div>
                ) : isLoading ? (
                  /* Model loading state */
                  <div className="flex flex-col items-center justify-center gap-4 pt-28">
                    <div className={cn("rounded-full p-4", isFileMode ? "bg-sky-500/10" : "bg-amber-500/10")}>
                      <Loader2 className={cn("h-8 w-8 animate-spin", isFileMode ? "text-sky-500" : "text-amber-500")} />
                    </div>
                    <span className="text-muted-foreground">
                      {isLoadingModel ? "Loading Whisper model..." : "Connecting..."}
                    </span>
                    <Progress className="w-48" />
                  </div>
                ) : isTranscribing ? (
                  /* File transcription in progress, no text yet */
                  <div className="flex flex-col items-center justify-center gap-4 pt-28">
                    <div className="rounded-full bg-sky-500/10 p-4">
                      <FileAudio className="h-8 w-8 text-sky-500 animate-pulse" />
                    </div>
                    <span className="text-muted-foreground">Transcribing...</span>
                    {progress != null && (
                      <div className="flex items-center gap-2 w-48">
                        <Progress value={progress} className="h-2 flex-1" />
                        <span className="text-xs text-muted-foreground">{Math.round(progress)}%</span>
                      </div>
                    )}
                  </div>
                ) : isFinalizing ? (
                  /* Finalizing state */
                  <div className="flex flex-col items-center justify-center gap-4 pt-28">
                    <div className={cn("rounded-full p-4", isFileMode ? "bg-sky-500/10" : "bg-amber-500/10")}>
                      <Loader2 className={cn("h-8 w-8 animate-spin", isFileMode ? "text-sky-500" : "text-amber-500")} />
                    </div>
                    <span className="text-muted-foreground">
                      Finalizing transcription...
                    </span>
                  </div>
                ) : isCompleted ? (
                  /* Completed (no text — unusual but possible) */
                  <div className="flex flex-col items-center justify-center gap-3 pt-28">
                    <div className="rounded-full bg-sky-500/10 p-4">
                      <Check className="h-8 w-8 text-sky-500" />
                    </div>
                    <span className="text-muted-foreground">Transcription complete</span>
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
