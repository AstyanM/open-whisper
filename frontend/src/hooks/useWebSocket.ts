import { useCallback, useEffect, useRef, useState } from "react";

export type WsState = "disconnected" | "connecting" | "connected";

export interface UseWebSocketReturn {
  state: WsState;
  send: (data: unknown) => void;
  connect: () => void;
  disconnect: () => void;
}

export function useWebSocket(
  url: string,
  onMessage: (data: unknown) => void,
  onOpen?: () => void,
  onClose?: () => void,
): UseWebSocketReturn {
  const [state, setState] = useState<WsState>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      // Remove handlers before closing to avoid triggering onClose callback
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.onopen = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setState("disconnected");
  }, []);

  const connect = useCallback(() => {
    disconnect();
    setState("connecting");

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setState("connected");
      onOpenRef.current?.();
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data: unknown = JSON.parse(event.data as string);
        onMessageRef.current(data);
      } catch {
        // ignore non-JSON messages
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      setState("disconnected");
      onCloseRef.current?.();
    };

    ws.onerror = (e) => {
      console.error("[WebSocket] error:", e);
      ws.close();
    };
  }, [url, disconnect]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  return { state, send, connect, disconnect };
}
