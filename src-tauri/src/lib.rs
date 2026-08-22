use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;
use tauri::Manager;

// Track the spawned Ollama server process so we can stop it later.
struct ServerState(Mutex<Option<Child>>);

#[tauri::command]
fn save_state(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    let dir = data_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create data dir: {e}"))?;
    let file = dir.join(format!("{key}.json"));
    fs::write(&file, value).map_err(|e| format!("Failed to write {}: {e}", file.display()))
}

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

/// Detect whether Ollama is installed on the system.
#[tauri::command]
fn check_ollama_installed() -> bool {
    // Check common install locations and PATH
    let candidates = [
        "ollama",
        "ollama.exe",
        "C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\Ollama\\ollama.exe",
        "/usr/local/bin/ollama",
        "/opt/homebrew/bin/ollama",
        "/usr/bin/ollama",
    ];

    for cmd in candidates {
        if cmd.contains("%USERNAME%") {
            // Expand %USERNAME% on Windows
            if let Ok(username) = std::env::var("USERNAME") {
                let expanded = cmd.replace("%USERNAME%", &username);
                if PathBuf::from(&expanded).exists() {
                    return true;
                }
            }
            continue;
        }
        if PathBuf::from(cmd).exists() {
            return true;
        }
    }

    // Also check if `ollama` is on PATH
    Command::new("ollama")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Check if the Ollama server is currently running (port 11434).
#[tauri::command]
fn check_ollama_running() -> bool {
    // Try a quick HTTP request to the Ollama API
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_millis(1500))
        .build()
        .ok();
    if let Some(c) = client {
        if let Ok(resp) = c.get("http://localhost:11434/api/version").send() {
            return resp.status().is_success();
        }
    }
    false
}

/// Start the Ollama server as a background process.
#[tauri::command]
fn start_ollama_server(state: tauri::State<'_, ServerState>) -> Result<bool, String> {
    // If already running, nothing to do.
    if check_ollama_running() {
        return Ok(true);
    }

    // Find the ollama binary
    let ollama_bin = find_ollama_binary()?;

    // Spawn the server in the background
    let child = Command::new(&ollama_bin)
        .arg("serve")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start Ollama server: {e}"))?;

    // Store the child process so we can stop it later
    let mut guard = state.0.lock().map_err(|e| format!("State lock error: {e}"))?;
    *guard = Some(child);

    Ok(true)
}

/// Stop the Ollama server process we started.
#[tauri::command]
fn stop_ollama_server(state: tauri::State<'_, ServerState>) -> Result<bool, String> {
    let mut guard = state.0.lock().map_err(|e| format!("State lock error: {e}"))?;
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        let _ = child.wait();
        Ok(true)
    } else {
        // If we didn't start it, try to kill via `ollama stop` or just report not running
        Ok(false)
    }
}

/// List installed local models via the Ollama API.
#[tauri::command]
fn list_local_models() -> Result<Vec<serde_json::Value>, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let resp = client
        .get("http://localhost:11434/api/tags")
        .send()
        .map_err(|e| format!("Failed to reach Ollama server: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Ollama API returned status {}", resp.status()));
    }

    let json: serde_json::Value = resp
        .json()
        .map_err(|e| format!("Failed to parse Ollama response: {e}"))?;

    let models = json
        .get("models")
        .and_then(|m| m.as_array())
        .cloned()
        .unwrap_or_default();

    Ok(models)
}

/// Pull a model from the Ollama registry.
#[tauri::command]
fn pull_local_model(model_name: String) -> Result<bool, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let resp = client
        .post("http://localhost:11434/api/pull")
        .json(&serde_json::json!({ "name": model_name, "stream": false }))
        .send()
        .map_err(|e| format!("Failed to pull model: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Failed to pull model: HTTP {}", resp.status()));
    }

    Ok(true)
}

/// Delete a local model.
#[tauri::command]
fn delete_local_model(model_name: String) -> Result<bool, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let resp = client
        .delete("http://localhost:11434/api/delete")
        .json(&serde_json::json!({ "name": model_name }))
        .send()
        .map_err(|e| format!("Failed to delete model: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Failed to delete model: HTTP {}", resp.status()));
    }

    Ok(true)
}


#[derive(serde::Serialize)]
struct FsEntry {
    name: String,
    path: String,
    is_dir: bool,
    size: Option<u64>,
    modified: Option<u64>,
}

fn meta_to_entry(path: &Path) -> FsEntry {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned());
    let md = fs::metadata(path).ok();
    let modified = md
        .as_ref()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs());
    FsEntry {
        name,
        path: path.to_string_lossy().into_owned(),
        is_dir: md.as_ref().map(|m| m.is_dir()).unwrap_or(false),
        size: md.as_ref().map(|m| m.len()),
        modified,
    }
}

/// Read the full contents of a text file.
#[tauri::command]
fn fs_read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {path}: {e}"))
}

/// Read a specific line range of a file. `end_line = 0` means "until EOF".
#[tauri::command]
fn fs_read_file_range(path: String, start_line: usize, end_line: usize) -> Result<String, String> {
    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read {path}: {e}"))?;
    let lines: Vec<&str> = content.lines().collect();
    let start = start_line.saturating_sub(1);
    if start >= lines.len() {
        return Ok(String::new());
    }
    let end = if end_line == 0 {
        lines.len()
    } else {
        end_line.min(lines.len())
    };
    Ok(lines[start..end].join("\n"))
}

/// Create a new file, or overwrite an existing one, with the given content.
#[tauri::command]
fn fs_write_file(path: String, content: String) -> Result<bool, String> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create dir {}: {e}", parent.display()))?;
    }
    fs::write(&p, content).map_err(|e| format!("Failed to write {path}: {e}"))?;
    Ok(true)
}

/// Append text to the end of a file, creating it if it doesn't exist.
#[tauri::command]
fn fs_append_file(path: String, content: String) -> Result<bool, String> {
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("Failed to open {path}: {e}"))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to append to {path}: {e}"))?;
    Ok(true)
}

/// Replace the first exact occurrence of `search` with `replace` in a file.
#[tauri::command]
fn fs_replace_in_file(path: String, search: String, replace: String) -> Result<bool, String> {
    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read {path}: {e}"))?;
    if !content.contains(&search) {
        return Err(format!("Search text not found in {path}"));
    }
    let updated = content.replacen(&search, &replace, 1);
    fs::write(&path, updated).map_err(|e| format!("Failed to write {path}: {e}"))?;
    Ok(true)
}

/// Permanently delete a file.
#[tauri::command]
fn fs_delete_file(path: String) -> Result<bool, String> {
    fs::remove_file(&path).map_err(|e| format!("Failed to delete {path}: {e}"))?;
    Ok(true)
}

/// Recursively delete a folder and everything inside it.
#[tauri::command]
fn fs_delete_dir(path: String) -> Result<bool, String> {
    fs::remove_dir_all(&path).map_err(|e| format!("Failed to delete dir {path}: {e}"))?;
    Ok(true)
}

/// Create a directory (and any missing parent directories).
#[tauri::command]
fn fs_create_dir(path: String) -> Result<bool, String> {
    fs::create_dir_all(&path).map_err(|e| format!("Failed to create dir {path}: {e}"))?;
    Ok(true)
}

/// List files and folders inside a directory (sorted: folders first, then name).
#[tauri::command]
fn fs_list_dir(path: String) -> Result<Vec<FsEntry>, String> {
    let rd = fs::read_dir(&path).map_err(|e| format!("Failed to list {path}: {e}"))?;
    let mut out = Vec::new();
    for entry in rd.flatten() {
        out.push(meta_to_entry(&entry.path()));
    }
    out.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(out)
}

/// Recursively search a directory. When `content` is true the pattern is
/// matched against file contents, otherwise against file paths. Matching is a
/// case-insensitive substring test.
#[tauri::command]
fn fs_search_files(path: String, pattern: String, content: Option<bool>) -> Result<Vec<String>, String> {
    fn walk(dir: &Path, pattern: &str, in_content: bool, out: &mut Vec<String>) -> Result<(), String> {
        let rd = fs::read_dir(dir).map_err(|e| format!("Failed to read {}: {e}", dir.display()))?;
        for entry in rd.flatten() {
            let p = entry.path();
            if p.is_dir() {
                walk(&p, pattern, in_content, out)?;
            } else {
                let pat = pattern.to_lowercase();
                let hit = if in_content {
                    fs::read_to_string(&p)
                        .map(|c| c.to_lowercase().contains(&pat))
                        .unwrap_or(false)
                } else {
                    p.to_string_lossy().to_lowercase().contains(&pat)
                };
                if hit {
                    out.push(p.to_string_lossy().into_owned());
                }
            }
        }
        Ok(())
    }
    let mut out = Vec::new();
    walk(Path::new(&path), &pattern, content.unwrap_or(false), &mut out)?;
    Ok(out)
}

/// Rename or move a file or folder.
#[tauri::command]
fn fs_rename(path: String, new_path: String) -> Result<bool, String> {
    fs::rename(&path, &new_path)
        .map_err(|e| format!("Failed to rename {path} -> {new_path}: {e}"))?;
    Ok(true)
}

/// Get the path to the ollama binary.
fn find_ollama_binary() -> Result<String, String> {
    // Check PATH first
    if let Ok(output) = Command::new("ollama").arg("--version").output() {
        if output.status.success() {
            return Ok("ollama".to_string());
        }
    }

    // Check common install locations
    let candidates = [
        "C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\Ollama\\ollama.exe",
        "/usr/local/bin/ollama",
        "/opt/homebrew/bin/ollama",
        "/usr/bin/ollama",
    ];

    for cmd in candidates {
        if cmd.contains("%USERNAME%") {
            if let Ok(username) = std::env::var("USERNAME") {
                let expanded = cmd.replace("%USERNAME%", &username);
                if PathBuf::from(&expanded).exists() {
                    return Ok(expanded);
                }
            }
            continue;
        }
        if PathBuf::from(cmd).exists() {
            return Ok(cmd.to_string());
        }
    }

    Err("Ollama is not installed. Please install Ollama from https://ollama.com to use local models.".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .manage(ServerState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            save_state,
            load_state,
            check_ollama_installed,
            check_ollama_running,
            start_ollama_server,
            stop_ollama_server,
            list_local_models,
            pull_local_model,
            delete_local_model,
            fs_read_file,
            fs_read_file_range,
            fs_write_file,
            fs_append_file,
            fs_replace_in_file,
            fs_delete_file,
            fs_delete_dir,
            fs_create_dir,
            fs_list_dir,
            fs_search_files,
            fs_rename
        ])
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