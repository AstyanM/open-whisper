import { createContext, useContext, useEffect, useState } from "react";

import { useTranscription } from "@/hooks/useTranscription";
import type { UseTranscriptionReturn } from "@/hooks/useTranscription";
import { useDictation } from "@/hooks/useDictation";
import type { UseDictationReturn } from "@/hooks/useDictation";
import { useTauriShortcuts } from "@/hooks/useTauriShortcuts";
import { emitEvent, listenEvent } from "@/lib/tauri";
import { DEFAULT_LANGUAGE } from "@/lib/constants";

export interface TranscriptionContextValue {
  language: string;
  setLanguage: (lang: string) => void;
  transcription: UseTranscriptionReturn;
  dictation: UseDictationReturn;
  isTranscribing: boolean;
  isDictating: boolean;
  isActive: boolean;
}

const TranscriptionContext =
  createContext<TranscriptionContextValue | null>(null);

export function TranscriptionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const transcription = useTranscription();
  const dictation = useDictation();

  const isTranscribing =
    transcription.state !== "idle" && transcription.state !== "error";
  const isDictating =
    dictation.state !== "idle" && dictation.state !== "error";
  const isActive = isTranscribing || isDictating;

  // Global shortcuts — live at app level so they work on any page
  useTauriShortcuts({
    onToggleDictation: () => dictation.toggle(language),
    onToggleTranscription: () => {
      if (isTranscribing) {
        transcription.stop();
      } else if (transcription.liveText) {
        transcription.resume(language);
      } else {
        transcription.start(language);
      }
    },
  });

  // Sync language from tray menu
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listenEvent<string>("tray:language-changed", (code) => {
      if (!isActive) setLanguage(code);
    }).then((fn) => (unlisten = fn));
    return () => unlisten?.();
  }, [isActive]);

  // Notify tray when language changes from UI
  useEffect(() => {
    emitEvent("language-changed", language);
  }, [language]);

  // Emit mic state to overlay window
  useEffect(() => {
    if (isDictating) {
      emitEvent("mic-state-changed", {
        state: dictation.state,
        language,
        mode: "dictation" as const,
      });
    } else if (isTranscribing) {
      emitEvent("mic-state-changed", {
        state: transcription.state,
        language,
        mode: "transcription" as const,
      });
    } else {
      emitEvent("mic-state-changed", {
        state: "idle" as const,
        language,
        mode: "none" as const,
      });
    }
  }, [
    transcription.state,
    dictation.state,
    language,
    isDictating,
    isTranscribing,
  ]);

  return (
    <TranscriptionContext.Provider
      value={{
        language,
        setLanguage,
        transcription,
        dictation,
        isTranscribing,
        isDictating,
        isActive,
      }}
    >
      {children}
    </TranscriptionContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTranscriptionContext(): TranscriptionContextValue {
  const ctx = useContext(TranscriptionContext);
  if (!ctx) {
    throw new Error(
      "useTranscriptionContext must be used within a TranscriptionProvider",
    );
  }
  return ctx;
}
