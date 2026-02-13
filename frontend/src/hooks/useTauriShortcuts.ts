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
    const cleanups: Array<() => void> = [];

    listenEvent("shortcut:toggle-dictation", () => {
      optionsRef.current.onToggleDictation?.();
    }).then((unlisten) => cleanups.push(unlisten));

    listenEvent("shortcut:toggle-transcription", () => {
      optionsRef.current.onToggleTranscription?.();
    }).then((unlisten) => cleanups.push(unlisten));

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, []);
}
