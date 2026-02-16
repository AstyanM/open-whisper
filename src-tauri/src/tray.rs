use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, Emitter, Listener, Manager, Wry,
};

const LANGUAGES: &[(&str, &str)] = &[
    ("fr", "Français"),
    ("en", "English"),
    ("es", "Español"),
    ("de", "Deutsch"),
    ("it", "Italiano"),
    ("pt", "Português"),
    ("nl", "Nederlands"),
    ("pl", "Polski"),
    ("ru", "Русский"),
    ("zh", "中文"),
    ("ja", "日本語"),
    ("ko", "한국어"),
    ("ar", "العربية"),
];

fn update_lang_checks(items: &[(String, CheckMenuItem<Wry>)], selected: &str) {
    for (code, item) in items {
        let _ = item.set_checked(code == selected);
    }
}

pub fn create_tray(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    let open_item = MenuItem::with_id(app, "open", "Open window", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    // Language submenu with check items
    let mut lang_items: Vec<(String, CheckMenuItem<Wry>)> = Vec::new();
    let lang_submenu = Submenu::with_id(app, "language", "Language", true)?;
    for &(code, label) in LANGUAGES {
        let item = CheckMenuItem::with_id(app, code, label, true, code == "fr", None::<&str>)?;
        lang_submenu.append(&item)?;
        lang_items.push((code.to_string(), item));
    }

    let menu = Menu::with_items(app, &[&open_item, &lang_submenu, &quit_item])?;

    // Clone lang_items for use in closures (Tauri menu items are ref-counted)
    let lang_items_for_menu = lang_items.clone();
    let lang_items_for_listen = lang_items.clone();

    let lang_codes: Vec<String> = LANGUAGES.iter().map(|&(c, _)| c.to_string()).collect();

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("OpenWhisper")
        .on_menu_event(move |app, event| {
            let id = event.id().as_ref();
            match id {
                "open" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                code if lang_codes.contains(&code.to_string()) => {
                    update_lang_checks(&lang_items_for_menu, code);
                    println!("[Tray] language changed to: {code}");
                    let _ = app.emit("tray:language-changed", code.to_string());
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    // Listen for language changes from frontend to sync tray checkmarks
    app.listen("language-changed", move |event| {
        let code = event.payload().trim_matches('"');
        println!("[Tray] frontend language changed to: {code}");
        update_lang_checks(&lang_items_for_listen, code);
    });

    println!("[Tray] system tray created");
    Ok(())
}
