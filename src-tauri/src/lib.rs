mod injection;
mod shortcuts;
mod tray;

#[tauri::command]
fn start_drag(window: tauri::Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![injection::inject_text, start_drag])
        .setup(|app| {
            shortcuts::register_shortcuts(app);
            tray::create_tray(app).expect("failed to create system tray");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
