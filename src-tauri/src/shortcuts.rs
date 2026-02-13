use tauri::{App, Emitter};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub fn register_shortcuts(app: &App) {
    let handle = app.handle().clone();

    app.global_shortcut()
        .on_shortcut("ctrl+shift+d", {
            let handle = handle.clone();
            move |_app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    println!("[Shortcuts] Ctrl+Shift+D pressed, emitting toggle-dictation");
                    match handle.emit("shortcut:toggle-dictation", ()) {
                        Ok(_) => println!("[Shortcuts] emit OK"),
                        Err(e) => eprintln!("[Shortcuts] emit error: {e}"),
                    }
                }
            }
        })
        .expect("failed to register Ctrl+Shift+D");

    app.global_shortcut()
        .on_shortcut("ctrl+shift+t", {
            let handle = handle.clone();
            move |_app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    println!("[Shortcuts] Ctrl+Shift+T pressed, emitting toggle-transcription");
                    match handle.emit("shortcut:toggle-transcription", ()) {
                        Ok(_) => println!("[Shortcuts] emit OK"),
                        Err(e) => eprintln!("[Shortcuts] emit error: {e}"),
                    }
                }
            }
        })
        .expect("failed to register Ctrl+Shift+T");

    println!("[Shortcuts] all shortcuts registered");
}
