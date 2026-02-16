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

interface OverlayConfigPayload {
  enabled: boolean;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  opacity: number;
  size: "small" | "medium";
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

  const [overlayPosition, setOverlayPosition] = useState<
    OverlayConfigPayload["position"]
  >("bottom-right");
  const [overlayOpacity, setOverlayOpacity] = useState(0.85);

  // Position the overlay window based on `pos`
  useEffect(() => {
    if (!isTauri()) return;

    (async () => {
      const { getCurrentWindow, currentMonitor } = await import(
        "@tauri-apps/api/window"
      );
      const { PhysicalPosition } = await import("@tauri-apps/api/dpi");
      const win = getCurrentWindow();
      const monitor = await currentMonitor();
      if (!monitor) return;

      const mw = monitor.size.width;
      const mh = monitor.size.height;
      const mx = monitor.position.x;
      const my = monitor.position.y;
      const margin = 16;
      const winW = 120;
      const winH = 56;

      let x: number;
      let y: number;
      switch (overlayPosition) {
        case "top-left":
          x = mx + margin;
          y = my + margin;
          break;
        case "top-right":
          x = mx + mw - winW - margin;
          y = my + margin;
          break;
        case "bottom-left":
          x = mx + margin;
          y = my + mh - winH - margin;
          break;
        default: // bottom-right
          x = mx + mw - winW - margin;
          y = my + mh - winH - margin;
          break;
      }

      await win.setPosition(new PhysicalPosition(x, y));
    })();
  }, [overlayPosition]);

  // Listen for overlay config changes from Settings page
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    listenEvent<OverlayConfigPayload>("overlay-config-changed", (cfg) => {
      setOverlayPosition(cfg.position);
      setOverlayOpacity(cfg.opacity);
      // Visibility is managed by Tauri window show/hide — not handled here
    }).then((unlisten) => {
      cleanup = unlisten;
    });
    return () => cleanup?.();
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
      style={{ opacity: overlayOpacity }}
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
