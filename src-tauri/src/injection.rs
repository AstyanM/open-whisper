use arboard::Clipboard;
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

static ENIGO: Mutex<Option<Enigo>> = Mutex::new(None);

fn get_enigo() -> Result<std::sync::MutexGuard<'static, Option<Enigo>>, String> {
    let mut guard = ENIGO.lock().map_err(|e| format!("Mutex poisoned: {e}"))?;
    if guard.is_none() {
        *guard = Some(
            Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init enigo: {e}"))?,
        );
    }
    Ok(guard)
}

#[tauri::command]
pub fn inject_text(text: &str) -> Result<(), String> {
    println!("[injection] inject_text called with: {:?}", text);

    // Set clipboard content
    let mut clipboard =
        Clipboard::new().map_err(|e| format!("Failed to open clipboard: {e}"))?;
    clipboard
        .set_text(text)
        .map_err(|e| format!("Failed to set clipboard: {e}"))?;

    // Small delay to let clipboard update propagate
    thread::sleep(Duration::from_millis(5));

    // Simulate Ctrl+V to paste
    let mut guard = get_enigo()?;
    let enigo = guard.as_mut().unwrap();
    enigo
        .key(Key::Control, Direction::Press)
        .map_err(|e| format!("Ctrl press failed: {e}"))?;
    enigo
        .key(Key::Unicode('v'), Direction::Click)
        .map_err(|e| format!("V click failed: {e}"))?;
    enigo
        .key(Key::Control, Direction::Release)
        .map_err(|e| format!("Ctrl release failed: {e}"))?;

    // Small delay to let the paste complete before next injection
    thread::sleep(Duration::from_millis(10));

    Ok(())
}
