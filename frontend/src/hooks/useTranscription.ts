import { useCallback, useRef, useState } from "react";
import { useWebSocket } from "./useWebSocket";
import { WS_URL, DEFAULT_LANGUAGE } from "@/lib/constants";

export type TranscriptionState =
  | "idle"
  | "connecting"
  | "connecting_vllm"
  | "recording"
  | "finalizing"
  | "error";

export interface UseTranscriptionReturn {
  state: TranscriptionState;
  start: (language?: string) => void;
  stop: () => void;
  liveText: string;
  sessionId: number | null;
  error: string | null;
  elapsedMs: number;
}

interface WsMessage {
  type: string;
  [key: string]: unknown;
}

export function useTranscription(): UseTranscriptionReturn {
  const [state, setState] = useState<TranscriptionState>("idle");
  const [liveText, setLiveText] = useState("");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const languageRef = useRef(DEFAULT_LANGUAGE);

  const handleMessage = useCallback(
    (raw: unknown) => {
      const msg = raw as WsMessage;
      switch (msg.type) {
        case "session_started":
          setSessionId(msg.session_id as number);
          break;

        case "status":
          if (msg.state === "connecting_vllm") {
            setState("connecting_vllm");
          } else if (msg.state === "recording") {
            setState("recording");
          }
          break;

        case "transcript_delta": {
          const delta = msg.delta as string;
          if (delta) {
            setLiveText((prev) => prev + delta);
          }
          setElapsedMs(msg.elapsed_ms as number);
          break;
        }

        case "segment_complete":
          break;

        case "session_ended":
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
    // disconnect is stable (no deps), safe to reference
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleOpen = useCallback(() => {
    send({
      type: "start",
      mode: "transcription",
      language: languageRef.current,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { send, connect, disconnect } = useWebSocket(
    `${WS_URL}/ws/transcribe`,
    handleMessage,
    handleOpen,
  );

  const start = useCallback(
    (language?: string) => {
      setLiveText("");
      setSessionId(null);
      setError(null);
      setElapsedMs(0);
      setState("connecting");
      languageRef.current = language ?? DEFAULT_LANGUAGE;
      connect();
    },
    [connect],
  );

  const stop = useCallback(() => {
    setState("finalizing");
    send({ type: "stop" });
    // Do NOT disconnect here — wait for session_ended from backend
  }, [send]);

  return { state, start, stop, liveText, sessionId, error, elapsedMs };
}
