import { cn } from "@/lib/utils";
import type { TranscriptionState } from "@/hooks/useTranscription";

const stateConfig: Record<
  TranscriptionState,
  { color: string; pulse: boolean; label: string }
> = {
  idle: { color: "bg-green-500", pulse: false, label: "Ready" },
  connecting: { color: "bg-yellow-500", pulse: true, label: "Connecting..." },
  connecting_vllm: {
    color: "bg-yellow-500",
    pulse: true,
    label: "Connecting to vLLM...",
  },
  recording: { color: "bg-red-500", pulse: true, label: "Recording" },
  finalizing: { color: "bg-yellow-500", pulse: true, label: "Finalizing..." },
  error: { color: "bg-red-500", pulse: false, label: "Error" },
};

interface StatusIndicatorProps {
  state: TranscriptionState;
}

export function StatusIndicator({ state }: StatusIndicatorProps) {
  const config = stateConfig[state];

  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-3 w-3">
        {config.pulse && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              config.color,
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex h-3 w-3 rounded-full",
            config.color,
          )}
        />
      </span>
      <span className="text-sm text-muted-foreground">{config.label}</span>
    </div>
  );
}
