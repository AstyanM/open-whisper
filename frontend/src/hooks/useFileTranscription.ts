import { useCallback, useEffect, useRef, useState } from "react";
import { WS_URL } from "@/lib/constants";
import { uploadFileForTranscription } from "@/lib/api";

export type FileTranscriptionState =
  | "idle"
  | "uploading"
  | "connecting"
  | "loading_model"
  | "transcribing"
  | "finalizing"
  | "completed"
  | "error";

export interface UseFileTranscriptionReturn {
  state: FileTranscriptionState;
  upload: (file: File, language: string) => Promise<void>;
  cancel: () => void;
  reset: () => void;
  liveText: string;
  sessionId: number | null;
  error: string | null;
  elapsedMs: number;
  progress: number;
  filename: string | null;
  audioDurationS: number | null;
}

interface WsMessage {
  type: string;
  [key: string]: unknown;
}

export function useFileTranscription(): UseFileTranscriptionReturn {
  const [state, setState] = useState<FileTranscriptionState>("idle");
  const [liveText, setLiveText] = useState("");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [progress, setProgress] = useState(0);
  const [filename, setFilename] = useState<string | null>(null);
  const [audioDurationS, setAudioDurationS] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const closeWs = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.onopen = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const upload = useCallback(
    async (file: File, language: string) => {
      // Reset state
      setLiveText("");
      setSessionId(null);
      setError(null);
      setElapsedMs(0);
      setProgress(0);
      setFilename(file.name);
      setAudioDurationS(null);
      setState("uploading");

      let sid: number;
      try {
        const result = await uploadFileForTranscription(file, language);
        sid = result.session_id;
        setSessionId(sid);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
        setState("error");
        return;
      }

      // Connect WebSocket for progress
      setState("connecting");
      const ws = new WebSocket(`${WS_URL}/ws/transcribe-file/${sid}`);
      wsRef.current = ws;

      ws.onopen = () => {
        // Connection established — server will start sending status messages
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg: WsMessage = JSON.parse(event.data as string);

          switch (msg.type) {
            case "status":
              if (msg.state === "loading_model") setState("loading_model");
              else if (msg.state === "transcribing") setState("transcribing");
              else if (msg.state === "finalizing") setState("finalizing");
              break;

            case "file_info":
              setAudioDurationS(msg.audio_duration_s as number);
              break;

            case "transcript_delta": {
              const delta = msg.delta as string;
              if (delta) setLiveText((prev) => prev + delta);
              setElapsedMs(msg.elapsed_ms as number);
              break;
            }

            case "progress":
              setProgress(msg.percent as number);
              break;

            case "session_ended":
              setState("completed");
              closeWs();
              break;

            case "error":
              setError(msg.message as string);
              setState("error");
              closeWs();
              break;
          }
        } catch {
          // Ignore non-JSON messages
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        setState((prev) => {
          if (prev !== "idle" && prev !== "completed" && prev !== "error") {
            setError("Connection lost");
            return "error";
          }
          return prev;
        });
      };

      ws.onerror = () => {
        ws.close();
      };
    },
    [closeWs],
  );

  const cancel = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "cancel" }));
    }
    closeWs();
    setState("idle");
  }, [closeWs]);

  const reset = useCallback(() => {
    closeWs();
    setLiveText("");
    setSessionId(null);
    setError(null);
    setElapsedMs(0);
    setProgress(0);
    setFilename(null);
    setAudioDurationS(null);
    setState("idle");
  }, [closeWs]);

  // Clean up WebSocket on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      closeWs();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    state,
    upload,
    cancel,
    reset,
    liveText,
    sessionId,
    error,
    elapsedMs,
    progress,
    filename,
    audioDurationS,
  };
}
