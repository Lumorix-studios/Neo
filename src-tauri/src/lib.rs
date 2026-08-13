
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

/// Writes a JSON blob to `{app_data_dir}/{key}.json`.
#[tauri::command]
fn save_state(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    let dir = data_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create data dir: {e}"))?;
    let file = dir.join(format!("{key}.json"));
    fs::write(&file, value).map_err(|e| format!("Failed to write {}: {e}", file.display()))
}

/// Reads a JSON blob from `{app_data_dir}/{key}.json`.
#[tauri::command]
fn load_state(app: tauri::AppHandle, key: String) -> Result<String, String> {
    let dir = data_dir(&app)?;
    let file = dir.join(format!("{key}.json"));
    match fs::read_to_string(&file) {
        Ok(content) => Ok(content),
        Err(_) => Ok("".into()),
    }
}

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![save_state, load_state])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
