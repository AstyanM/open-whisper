use tauri::{App, Emitter};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub fn register_shortcuts(app: &App) {
    let handle = app.handle().clone();

    app.global_shortcut()
        .on_shortcut("ctrl+shift+d", {
            let handle = handle.clone();
            move |_app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    let _ = handle.emit("shortcut:toggle-dictation", ());
                }
            }
        })
        .expect("failed to register Ctrl+Shift+D");

    app.global_shortcut()
        .on_shortcut("ctrl+shift+t", {
            let handle = handle.clone();
            move |_app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    let _ = handle.emit("shortcut:toggle-transcription", ());
                }
            }
        })
        .expect("failed to register Ctrl+Shift+T");
}
