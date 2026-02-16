import { useCallback, useRef, useState } from "react";
import { useWebSocket } from "./useWebSocket";
import { WS_URL, DEFAULT_LANGUAGE } from "@/lib/constants";
import { invokeCommand } from "@/lib/tauri";

export type DictationState =
  | "idle"
  | "connecting"
  | "loading_model"
  | "recording"
  | "finalizing"
  | "error";

export interface UseDictationReturn {
  state: DictationState;
  toggle: (language?: string) => void;
  error: string | null;
  device: string | null;
}

interface WsMessage {
  type: string;
  [key: string]: unknown;
}

export function useDictation(): UseDictationReturn {
  const [state, setState] = useState<DictationState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<string | null>(null);
  const languageRef = useRef(DEFAULT_LANGUAGE);

  // Buffer deltas and inject in batches to avoid dropped keystrokes
  const bufferRef = useRef("");
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const injectingRef = useRef(false);

  const flushBuffer = useCallback(() => {
    flushTimerRef.current = null;
    if (injectingRef.current || !bufferRef.current) return;

    const text = bufferRef.current;
    bufferRef.current = "";
    injectingRef.current = true;

    invokeCommand("inject_text", { text })
      .then(() => console.log("[Dictation] injected:", text))
      .catch((e) => console.error("[Dictation] inject_text failed:", e))
      .finally(() => {
        injectingRef.current = false;
        // Flush remaining buffer after previous injection completes
        if (bufferRef.current) {
          flushBuffer();
        }
      });
  }, []);

  const queueDelta = useCallback(
    (delta: string) => {
      bufferRef.current += delta;
      if (!flushTimerRef.current && !injectingRef.current) {
        flushTimerRef.current = setTimeout(flushBuffer, 80);
      }
    },
    [flushBuffer],
  );

  const handleMessage = useCallback(
    (raw: unknown) => {
      const msg = raw as WsMessage;
      switch (msg.type) {
        case "session_started":
          console.log("[Dictation] session started");
          break;

        case "status":
          console.log("[Dictation] status:", msg.state);
          if (msg.state === "loading_model") {
            setState("loading_model");
          } else if (msg.state === "recording") {
            setState("recording");
            if (msg.device) setDevice(msg.device as string);
          }
          break;

        case "transcript_delta": {
          const delta = msg.delta as string;
          console.log("[Dictation] delta:", JSON.stringify(delta));
          if (delta) {
            queueDelta(delta);
          }
          break;
        }

        case "segment_complete":
          break;

        case "session_ended":
          // Flush any remaining buffered text before ending
          if (bufferRef.current) {
            flushBuffer();
          }
          setState("idle");
          disconnect();
          break;

        case "error":
          setError(msg.message as string);
          setState("error");
          disconnect();
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleOpen = useCallback(() => {
    console.log("[Dictation] WS opened, sending start");
    send({
      type: "start",
      mode: "dictation",
      language: languageRef.current,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = useCallback(() => {
    console.log("[Dictation] WS closed");
    setState((prev) => {
      if (prev !== "idle" && prev !== "error") {
        setError("Connection lost");
        return "error";
      }
      return prev;
    });
  }, []);

  const { send, connect, disconnect } = useWebSocket(
    `${WS_URL}/ws/transcribe`,
    handleMessage,
    handleOpen,
    handleClose,
  );

  const toggle = useCallback(
    (language?: string) => {
      console.log("[Dictation] toggle called, state:", state);
      if (state === "idle" || state === "error") {
        setError(null);
        setState("connecting");
        languageRef.current = language ?? DEFAULT_LANGUAGE;
        console.log("[Dictation] connecting WS...");
        connect();
      } else if (state === "recording") {
        setState("finalizing");
        send({ type: "stop" });
      } else {
        // connecting, loading_model, finalizing — force stop
        setState("idle");
        disconnect();
      }
    },
    [state, connect, send],
  );

  return { state, toggle, error, device };
}
