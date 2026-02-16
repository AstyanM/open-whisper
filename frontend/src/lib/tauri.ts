/**
 * Tauri IPC bridge — wraps @tauri-apps/api with environment detection.
 * When running in a plain browser (npm run dev), uses BroadcastChannel
 * as a fallback so cross-window events still work.
 */

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

type UnlistenFn = () => void;

/** Lazy-initialised BroadcastChannel for browser dev mode. */
let _channel: BroadcastChannel | null = null;
function getBroadcastChannel(): BroadcastChannel {
  if (!_channel) _channel = new BroadcastChannel("vts-events");
  return _channel;
}

/**
 * Listen for an event (Tauri event or BroadcastChannel in dev mode).
 * Returns a cleanup function.
 */
export async function listenEvent<T = unknown>(
  event: string,
  callback: (payload: T) => void,
): Promise<UnlistenFn> {
  if (isTauri()) {
    const { listen } = await import("@tauri-apps/api/event");
    return listen<T>(event, (e) => callback(e.payload));
  }
  // Browser fallback via BroadcastChannel
  const ch = getBroadcastChannel();
  const handler = (e: MessageEvent) => {
    if (e.data?.event === event) callback(e.data.payload as T);
  };
  ch.addEventListener("message", handler);
  return () => ch.removeEventListener("message", handler);
}

/**
 * Emit an event (Tauri broadcast or BroadcastChannel in dev mode).
 */
export async function emitEvent<T>(
  event: string,
  payload: T,
): Promise<void> {
  if (isTauri()) {
    const { emit } = await import("@tauri-apps/api/event");
    await emit(event, payload);
    return;
  }
  // Browser fallback
  getBroadcastChannel().postMessage({ event, payload });
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

/**
 * Show or hide a Tauri window by its label.
 * No-op if not running in Tauri.
 */
export async function setWindowVisible(
  label: string,
  visible: boolean,
): Promise<void> {
  if (!isTauri()) return;
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const win = await WebviewWindow.getByLabel(label);
  if (!win) return;
  if (visible) {
    await win.show();
  } else {
    await win.hide();
  }
}
