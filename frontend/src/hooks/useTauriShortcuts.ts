import { useEffect, useRef } from "react";
import { listenEvent } from "@/lib/tauri";

interface UseTauriShortcutsOptions {
  onToggleDictation?: () => void;
  onToggleTranscription?: () => void;
}

/**
 * Listens for global shortcut events emitted by Tauri (Rust).
 * No-op when running in a plain browser.
 */
export function useTauriShortcuts(options: UseTauriShortcutsOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    let aborted = false;
    const cleanups: Array<() => void> = [];

    listenEvent("shortcut:toggle-dictation", () => {
      console.log("[Shortcuts] toggle-dictation event received");
      optionsRef.current.onToggleDictation?.();
    }).then((unlisten) => {
      if (aborted) {
        unlisten();
      } else {
        cleanups.push(unlisten);
      }
    });

    listenEvent("shortcut:toggle-transcription", () => {
      console.log("[Shortcuts] toggle-transcription event received");
      optionsRef.current.onToggleTranscription?.();
    }).then((unlisten) => {
      if (aborted) {
        unlisten();
      } else {
        cleanups.push(unlisten);
      }
    });

    return () => {
      aborted = true;
      cleanups.forEach((fn) => fn());
    };
  }, []);
}
