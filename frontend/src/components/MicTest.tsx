import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WS_URL } from "@/lib/constants";

const MAX_DURATION_S = 15;

interface MicTestProps {
  device: string;
}

export function MicTest({ device }: MicTestProps) {
  const [testing, setTesting] = useState(false);
  const [rms, setRms] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const stop = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "stop" }));
    }
    wsRef.current?.close();
    wsRef.current = null;
    clearTimeout(timerRef.current);
    setTesting(false);
    setRms(0);
  }, []);

  const start = useCallback(() => {
    setError(null);
    setRms(0);

    const ws = new WebSocket(`${WS_URL}/ws/mic-test`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "start", device }));
      setTesting(true);
      // Auto-stop after MAX_DURATION_S
      timerRef.current = setTimeout(stop, MAX_DURATION_S * 1000);
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "level") {
        setRms(msg.rms);
      } else if (msg.type === "error") {
        setError(msg.message);
        stop();
      }
    };

    ws.onerror = () => {
      setError("Connection failed");
      stop();
    };

    ws.onclose = () => {
      setTesting(false);
      setRms(0);
      clearTimeout(timerRef.current);
    };
  }, [device, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      clearTimeout(timerRef.current);
    };
  }, []);

  // Map RMS to a visual percentage (apply some gain so normal speech is visible)
  const level = Math.min(rms * 5, 1);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Microphone test</span>
        <Button
          variant={testing ? "destructive" : "outline"}
          size="sm"
          onClick={testing ? stop : start}
        >
          {testing ? (
            <>
              <MicOff className="mr-2 h-4 w-4" />
              Stop
            </>
          ) : (
            <>
              <Mic className="mr-2 h-4 w-4" />
              Test
            </>
          )}
        </Button>
      </div>

      {/* Volume bar */}
      <div className="h-3 w-full overflow-hidden rounded-full bg-muted ring-1 ring-border">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-75",
            testing ? "opacity-100" : "opacity-0",
          )}
          style={{
            width: `${level * 100}%`,
            background:
              level < 0.5
                ? `linear-gradient(90deg, #22c55e, #84cc16)`
                : level < 0.8
                  ? `linear-gradient(90deg, #22c55e, #84cc16, #eab308)`
                  : `linear-gradient(90deg, #22c55e, #84cc16, #eab308, #ef4444)`,
          }}
        />
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
