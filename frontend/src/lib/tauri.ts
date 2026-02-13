/**
 * Tauri IPC bridge — wraps @tauri-apps/api with environment detection.
 * When running in a plain browser (npm run dev), all calls are no-ops.
 */

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

type UnlistenFn = () => void;

/**
 * Listen for a Tauri event emitted from Rust.
 * Returns a cleanup function. No-op if not running in Tauri.
 */
export async function listenEvent<T = unknown>(
  event: string,
  callback: (payload: T) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    console.log("[Tauri] listenEvent skipped (not in Tauri)", event);
    return () => {};
  }
  console.log("[Tauri] listenEvent registering:", event);
  const { listen } = await import("@tauri-apps/api/event");
  return listen<T>(event, (e) => {
    console.log("[Tauri] event received:", event, e.payload);
    callback(e.payload);
  });
}

/**
 * Emit a Tauri event (received by all windows + Rust listeners).
 * No-op if not running in Tauri.
 */
export async function emitEvent<T>(
  event: string,
  payload: T,
): Promise<void> {
  if (!isTauri()) return;
  const { emit } = await import("@tauri-apps/api/event");
  await emit(event, payload);
}

/**
 * Invoke a Tauri command (Rust #[tauri::command]).
 * No-op if not running in Tauri.
 */
export async function invokeCommand<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T | undefined> {
  if (!isTauri()) return undefined;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}
