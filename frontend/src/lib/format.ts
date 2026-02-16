import { LANGUAGES } from "./constants";

/** Format seconds into "M:SS" (e.g. "2:05"). Returns "--:--" for null. */
export function formatDuration(seconds: number | null): string {
  if (seconds == null) return "--:--";
  const totalSec = Math.floor(seconds);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

/** Format milliseconds into "M:SS" (e.g. "2:05"). */
export function formatDurationMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

/** Format milliseconds into "M:SS.mmm" (e.g. "1:23.456"). */
export function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const millis = ms % 1000;
  return `${min}:${sec.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
}

/** Format an ISO date string with medium date + short time using browser locale. */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(navigator.language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

/** Format an ISO date string with long date + medium time using browser locale. */
export function formatDateLong(iso: string): string {
  return new Intl.DateTimeFormat(navigator.language, {
    dateStyle: "long",
    timeStyle: "medium",
  }).format(new Date(iso));
}

/** Format an ISO date as a relative string: "2h ago", "Yesterday", "Jun 15". */
export function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Intl.DateTimeFormat(navigator.language, {
    month: "short",
    day: "numeric",
  }).format(date);
}

/** Get the display label for a language code. */
export function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
