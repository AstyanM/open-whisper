import { cn } from "@/lib/utils";
import type { TranscriptionState } from "@/hooks/useTranscription";

const stateConfig: Record<
  TranscriptionState,
  { color: string; glow: string; pulse: boolean; label: string }
> = {
  idle: { color: "bg-stone-500", glow: "", pulse: false, label: "Ready" },
  connecting: {
    color: "bg-amber-500",
    glow: "shadow-[0_0_6px_rgba(245,158,11,0.4)]",
    pulse: true,
    label: "Connecting...",
  },
  loading_model: {
    color: "bg-amber-500",
    glow: "shadow-[0_0_6px_rgba(245,158,11,0.4)]",
    pulse: true,
    label: "Loading model...",
  },
  recording: {
    color: "bg-amber-500",
    glow: "shadow-[0_0_6px_rgba(245,158,11,0.4)]",
    pulse: true,
    label: "Recording",
  },
  finalizing: {
    color: "bg-amber-500",
    glow: "shadow-[0_0_6px_rgba(245,158,11,0.4)]",
    pulse: true,
    label: "Finalizing...",
  },
  error: { color: "bg-red-500", glow: "", pulse: false, label: "Error" },
};

interface StatusIndicatorProps {
  state: TranscriptionState;
  device?: string | null;
}

export function StatusIndicator({ state, device }: StatusIndicatorProps) {
  const config = stateConfig[state];

  const label =
    state === "recording" && device
      ? `Recording (${device})`
      : config.label;

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
            config.glow,
          )}
        />
      </span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
