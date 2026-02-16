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

const modeColors = {
  transcription: {
    dot: "bg-amber-500",
    ping: "bg-amber-500",
    glow: "shadow-[0_0_8px_rgba(245,158,11,0.5)]",
    text: "text-amber-200",
    modeText: "text-amber-300",
    ambientGlow:
      "shadow-[0_0_12px_4px_rgba(245,158,11,0.2),0_0_24px_8px_rgba(245,158,11,0.08)]",
  },
  dictation: {
    dot: "bg-emerald-500",
    ping: "bg-emerald-500",
    glow: "shadow-[0_0_8px_rgba(16,185,129,0.5)]",
    text: "text-emerald-200",
    modeText: "text-emerald-300",
    ambientGlow:
      "shadow-[0_0_12px_4px_rgba(16,185,129,0.2),0_0_24px_8px_rgba(16,185,129,0.08)]",
  },
  none: {
    dot: "bg-stone-500",
    ping: "bg-stone-500",
    glow: "",
    text: "text-stone-300",
    modeText: "text-stone-400",
    ambientGlow: "",
  },
};

function getOverlayStyle(
  state: MicStatePayload["state"],
  mode: MicStatePayload["mode"],
) {
  const colors = modeColors[mode] ?? modeColors.none;

  if (state === "error") {
    return {
      dot: "bg-red-500",
      ping: "bg-red-500",
      glow: "",
      pulse: false,
      text: "text-red-200",
      modeText: "text-red-300",
      ambientGlow: "shadow-[0_0_12px_4px_rgba(239,68,68,0.2)]",
    };
  }
  if (state === "idle") {
    return {
      dot: "bg-transparent",
      ping: "bg-stone-500",
      glow: "",
      pulse: false,
      text: "text-stone-300",
      modeText: "text-stone-400",
      ambientGlow: "",
      isIdle: true,
    };
  }
  const pulse =
    state === "connecting" ||
    state === "connecting_vllm" ||
    state === "recording" ||
    state === "finalizing";
  return { ...colors, pulse };
}

/** Tiny animated waveform bars for recording state */
function WaveformBars({ colorClass }: { colorClass: string }) {
  return (
    <div className="flex items-end gap-[2px] h-3.5 w-4">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={cn("w-[2.5px] rounded-full", colorClass)}
          style={{
            animation: `overlay-bar-${i} ${0.8 + i * 0.15}s ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  );
}

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

  // Make body transparent for the overlay window
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    return () => {
      document.documentElement.style.background = "";
      document.body.style.background = "";
    };
  }, []);

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

  // Compute window size: capsule + padding for ambient glow
  const extraElements = [showLanguage, showMode, showDuration].filter(
    Boolean,
  ).length;
  const padding = 14;
  const capsuleW = 44 + extraElements * 38;
  const capsuleH = 30;
  const winW = capsuleW + padding * 2;
  const winH = capsuleH + padding * 2;

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
  }, [overlayPosition, winW, winH]);

  // Listen for overlay config changes from Settings page
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    listenEvent<OverlayConfigPayload>(
      "overlay-config-changed",
      applyConfig,
    ).then((unlisten) => {
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

  const style = getOverlayStyle(micState.state, micState.mode);
  const langCode = micState.language.toUpperCase();
  const modeLabel =
    micState.mode === "transcription"
      ? "TRS"
      : micState.mode === "dictation"
        ? "DIC"
        : null;
  const durationStr = `${String(Math.floor(elapsed / 60)).padStart(1, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  const isRecording = micState.state === "recording";
  const isIdle = "isIdle" in style && style.isIdle;

  return (
    <div
      className="flex h-screen w-screen items-center justify-center"
      style={{ background: "transparent" }}
      onMouseDown={handleMouseDown}
    >
      {/* Capsule */}
      <div
        className={cn(
          // Shape
          "flex items-center gap-2.5 rounded-full px-3.5 py-2",
          // Glass morphism
          "bg-stone-900/80 backdrop-blur-md",
          "border border-white/[0.08]",
          "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]",
          // Transitions
          "transition-all duration-500 ease-in-out",
          // Mode ambient glow
          style.ambientGlow,
          // Interaction
          "select-none cursor-grab active:cursor-grabbing",
        )}
        style={{ opacity: overlayOpacity }}
      >
        <div className="pointer-events-none flex items-center gap-2.5">
          {/* Indicator: waveform bars when recording, dot otherwise */}
          {isRecording ? (
            <WaveformBars
              colorClass={modeColors[micState.mode]?.dot ?? "bg-stone-500"}
            />
          ) : (
            <span className="relative flex h-3.5 w-3.5">
              {style.pulse && (
                <span
                  className={cn(
                    "absolute inline-flex h-full w-full rounded-full animate-breathe",
                    style.ping,
                  )}
                />
              )}
              <span
                className={cn(
                  "relative inline-flex h-3.5 w-3.5 rounded-full transition-colors duration-300",
                  style.dot,
                  style.glow,
                  isIdle && "border border-stone-500 animate-idle-pulse",
                )}
              />
            </span>
          )}

          {/* Language code */}
          {showLanguage && (
            <span
              className={cn(
                "text-xs font-medium transition-colors duration-300",
                style.text,
              )}
            >
              {langCode}
            </span>
          )}

          {/* Mode label */}
          {showMode && modeLabel && (
            <span
              className={cn(
                "text-xs font-medium transition-colors duration-300",
                style.modeText,
              )}
            >
              {modeLabel}
            </span>
          )}

          {/* Duration timer */}
          {showDuration && isRecording && (
            <span className="text-xs font-mono text-stone-300">
              {durationStr}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
