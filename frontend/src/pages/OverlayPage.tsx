import { useEffect, useRef, useState } from "react";
import { listenEvent, isTauri, invokeCommand } from "@/lib/tauri";
import { fetchFullConfig } from "@/lib/api";
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
  show_language: boolean;
  show_mode: boolean;
  show_duration: boolean;
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
  const [showLanguage, setShowLanguage] = useState(true);
  const [showMode, setShowMode] = useState(false);
  const [showDuration, setShowDuration] = useState(false);

  // Recording duration timer
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  /** Apply an overlay config payload to all state variables. */
  function applyConfig(cfg: OverlayConfigPayload) {
    setOverlayPosition(cfg.position);
    setOverlayOpacity(cfg.opacity);
    setShowLanguage(cfg.show_language);
    setShowMode(cfg.show_mode);
    setShowDuration(cfg.show_duration);
  }

  // Load initial overlay config from backend
  useEffect(() => {
    fetchFullConfig()
      .then((cfg) => applyConfig(cfg.overlay))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const isRecording = micState.state === "recording";
    if (isRecording) {
      setElapsed(0);
      intervalRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      clearInterval(intervalRef.current);
      if (micState.state === "idle") setElapsed(0);
    }
    return () => clearInterval(intervalRef.current);
  }, [micState.state]);

  // Compute window width based on visible elements
  const extraElements = [showLanguage, showMode, showDuration].filter(Boolean).length;
  const winW = 40 + extraElements * 36; // base (dot) + ~36px per text element
  const winH = 56;

  // Position + resize the overlay window
  useEffect(() => {
    if (!isTauri()) return;

    (async () => {
      const { getCurrentWindow, currentMonitor } = await import(
        "@tauri-apps/api/window"
      );
      const { PhysicalPosition, PhysicalSize } = await import(
        "@tauri-apps/api/dpi"
      );
      const win = getCurrentWindow();
      const monitor = await currentMonitor();
      if (!monitor) return;

      await win.setSize(new PhysicalSize(winW, winH));

      const mw = monitor.size.width;
      const mh = monitor.size.height;
      const mx = monitor.position.x;
      const my = monitor.position.y;
      const margin = 16;

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
  }, [overlayPosition, winW]);

  // Listen for overlay config changes from Settings page
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    listenEvent<OverlayConfigPayload>("overlay-config-changed", applyConfig).then(
      (unlisten) => {
        cleanup = unlisten;
      },
    );
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
  const modeLabel =
    micState.mode === "transcription"
      ? "TRS"
      : micState.mode === "dictation"
        ? "DIC"
        : null;
  const durationStr = `${String(Math.floor(elapsed / 60)).padStart(1, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

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
        {showLanguage && (
          <span className="text-xs font-medium text-gray-200">{langCode}</span>
        )}
        {showMode && modeLabel && (
          <span className="text-xs font-medium text-gray-400">{modeLabel}</span>
        )}
        {showDuration && micState.state === "recording" && (
          <span className="text-xs font-mono text-gray-300">{durationStr}</span>
        )}
      </div>
    </div>
  );
}
