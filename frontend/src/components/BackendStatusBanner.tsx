import { useBackendHealth } from "@/hooks/useBackendHealth";
import { cn } from "@/lib/utils";

export function BackendStatusBanner() {
  const { status, checks } = useBackendHealth();

  if (status === "healthy" || status === "unknown") return null;

  const messages: string[] = [];
  if (status === "unreachable") {
    messages.push("Backend is unreachable");
  } else {
    if (checks.transcription?.status === "error") messages.push("Transcription engine unavailable");
    if (checks.audio?.status === "error") messages.push("No audio device");
    if (checks.database?.status === "error") messages.push("Database error");
  }

  const isError = status === "unreachable" || status === "unhealthy";

  return (
    <div
      className={cn(
        "mb-4 rounded-md border px-3 py-2 text-sm",
        isError
          ? "border-destructive/50 bg-destructive/10 text-destructive"
          : "border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
      )}
    >
      {messages.join(" — ") || `Backend status: ${status}`}
    </div>
  );
}
