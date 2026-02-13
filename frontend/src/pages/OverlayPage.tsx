import { useEffect, useState } from "react";
import { listenEvent, isTauri, invokeCommand } from "@/lib/tauri";
import { cn } from "@/lib/utils";

export interface MicStatePayload {
  state:
    | "idle"
    | "connecting"
    | "connecting_vllm"
    | "recording"
    | "finalizing"
    | "error";
  language: string;
  mode: "transcription" | "dictation" | "none";
}

const stateStyles: Record<string, { color: string; pulse: boolean }> = {
  idle: { color: "bg-gray-500", pulse: false },
  connecting: { color: "bg-yellow-500", pulse: true },
  connecting_vllm: { color: "bg-yellow-500", pulse: true },
  recording: { color: "bg-red-500", pulse: true },
  finalizing: { color: "bg-yellow-500", pulse: true },
  error: { color: "bg-red-500", pulse: false },
};

export function OverlayPage() {
  const [micState, setMicState] = useState<MicStatePayload>({
    state: "idle",
    language: "fr",
    mode: "none",
  });

  // Position overlay at bottom-right of screen on mount
  useEffect(() => {
    if (!isTauri()) return;

    (async () => {
      const { getCurrentWindow, currentMonitor } = await import(
        "@tauri-apps/api/window"
      );
      const { PhysicalPosition } = await import("@tauri-apps/api/dpi");
      const win = getCurrentWindow();
      const monitor = await currentMonitor();
      if (monitor) {
        const x = monitor.position.x + monitor.size.width - 120;
        const y = monitor.position.y + monitor.size.height - 56;
        await win.setPosition(new PhysicalPosition(x, y));
      }
    })();
  }, []);

  // Listen for mic state changes from the main window
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    listenEvent<MicStatePayload>("mic-state-changed", (payload) => {
      setMicState(payload);
    }).then((unlisten) => {
      cleanup = unlisten;
    });
    return () => cleanup?.();
  }, []);

  const handleMouseDown = () => {
    invokeCommand("start_drag");
  };

  const { color, pulse } = stateStyles[micState.state] ?? stateStyles.idle;
  const langCode = micState.language.toUpperCase();

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="flex h-screen w-screen cursor-grab items-center justify-center bg-gray-900 select-none active:cursor-grabbing"
      onMouseDown={handleMouseDown}
    >
      <div className="pointer-events-none flex items-center gap-2">
        <span className="relative flex h-3 w-3">
          {pulse && (
            <span
              className={cn(
                "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                color,
              )}
            />
          )}
          <span
            className={cn("relative inline-flex h-3 w-3 rounded-full", color)}
          />
        </span>
        <span className="text-xs font-medium text-gray-200">{langCode}</span>
      </div>
    </div>
  );
}
