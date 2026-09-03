use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, Ordering};
use std::thread;
use std::time::UNIX_EPOCH;
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use tauri::{Emitter, Manager};

/// Windows-only: CREATE_NO_WINDOW stops child processes from flashing or
/// keeping open a visible OS console window.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Mark a child process as windowless on Windows (no-op on other platforms).
/// Every background spawn (ollama probes, the ollama server, agent
/// `run_command`) must go through this or a console window pops up over the
/// app each time the command runs.
fn suppress_window(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    let _ = cmd;
    cmd
}

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

    // Also check if `ollama` is on PATH (windowless — this runs on startup
    // and used to flash a console every time).
    let mut probe = Command::new("ollama");
    probe
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    suppress_window(&mut probe);
    probe
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
        if let Ok(resp) = c.get("http://127.0.0.1:11434/api/version").send() {
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

    // Spawn the server in the background (windowless — the server outlives
    // the request and must never own a visible console).
    let mut cmd = Command::new(&ollama_bin);
    cmd.arg("serve").stdout(Stdio::null()).stderr(Stdio::null());
    suppress_window(&mut cmd);
    let child = cmd
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
        .get("http://127.0.0.1:11434/api/tags")
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

/// Pull a model from the Ollama registry. Downloads can take many minutes
/// for multi-GB models, so this uses a very long timeout and reports any
/// registry error verbatim.
#[tauri::command]
fn pull_local_model(model_name: String) -> Result<bool, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(60 * 60)) // 1 hour
        .connect_timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let resp = client
        .post("http://127.0.0.1:11434/api/pull")
        .json(&serde_json::json!({ "name": model_name, "stream": false }))
        .send()
        .map_err(|e| format!("Failed to reach Ollama while pulling: {e}"))?;

    let status = resp.status();
    // Surface registry errors ("model not found", auth issues, disk full…)
    let body = resp.text().unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Pull failed (HTTP {status}): {body}"));
    }
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&body) {
        if let Some(err) = v.get("error").and_then(|e| e.as_str()) {
            return Err(format!("Pull failed: {err}"));
        }
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
        .delete("http://127.0.0.1:11434/api/delete")
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


const SEARCH_RESULT_LIMIT: usize = 500;

#[tauri::command]
fn fs_search_files(path: String, pattern: String, content: Option<bool>) -> Result<Vec<String>, String> {
    fn walk(dir: &Path, pattern: &str, in_content: bool, out: &mut Vec<String>) -> Result<(), String> {
        if out.len() >= SEARCH_RESULT_LIMIT {
            return Ok(());
        }
        // Skip dependency/vendor/build dirs and unreadable dirs gracefully —
        // one permission error or node_modules crawl used to stall the search.
        const SKIP: [&str; 9] = [
            "node_modules",
            ".git",
            "target",
            "dist",
            ".next",
            "build",
            "__pycache__",
            ".venv",
            "venv",
        ];
        let Ok(rd) = fs::read_dir(dir) else {
            return Ok(());
        };
        let pat = pattern.to_lowercase();
        for entry in rd.flatten() {
            if out.len() >= SEARCH_RESULT_LIMIT {
                return Ok(());
            }
            let p = entry.path();
            let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            if p.is_dir() {
                if !SKIP.contains(&name.as_str()) {
                    walk(&p, pattern, in_content, out)?;
                }
            } else if in_content {
                // Skip huge files (lockfiles, bundles) and binary data.
                if let Ok(meta) = entry.metadata() {
                    if meta.len() > 1_000_000 {
                        continue;
                    }
                }
                // Content search: report every matching line as `path:line: text`
                // so the model can jump straight to the right spot.
                if let Ok(text) = fs::read_to_string(&p) {
                    for (i, line) in text.lines().enumerate() {
                        if line.to_lowercase().contains(&pat) {
                            out.push(format!(
                                "{}:{}: {}",
                                p.to_string_lossy(),
                                i + 1,
                                line.trim()
                            ));
                            if out.len() >= SEARCH_RESULT_LIMIT {
                                break;
                            }
                        }
                    }
                }
            } else {
                if p.to_string_lossy().to_lowercase().contains(&pat) {
                    out.push(p.to_string_lossy().into_owned());
                }
            }
        }
        Ok(())
    }
    let mut out = Vec::new();
    walk(Path::new(&path), &pattern, content.unwrap_or(false), &mut out)?;
    if out.len() >= SEARCH_RESULT_LIMIT {
        out.push(format!("… results truncated at {SEARCH_RESULT_LIMIT} matches"));
    }
    Ok(out)
}


#[tauri::command]
async fn run_command(
    command: String,
    cwd: Option<String>,
    timeout_secs: Option<u64>,
) -> Result<serde_json::Value, String> {
    use std::time::{Duration, Instant};

    const CAP: usize = 128 * 1024;
    /// Read a stream to a String, capping memory at `max` bytes and never
    /// failing on invalid UTF-8 (PowerShell emits the OEM codepage by default).
    fn drain_capped(mut h: impl Read, max: usize) -> String {
        let mut buf: Vec<u8> = Vec::new();
        let mut chunk = [0u8; 8192];
        loop {
            match h.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    buf.extend_from_slice(&chunk[..n]);
                    if buf.len() >= max {
                        break;
                    }
                }
            }
        }
        String::from_utf8_lossy(&buf).into_owned()
    }

    let shell = if cfg!(target_os = "windows") {
        "powershell.exe"
    } else {
        "sh"
    };

    let mut cmd = Command::new(shell);
    if cfg!(target_os = "windows") {
        // Force UTF-8 console output so non-ASCII output survives the pipe.
        cmd.arg("-NoProfile").arg("-Command").arg(format!(
            "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; {command}"
        ));
    } else {
        cmd.arg("-c").arg(&command);
    }
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    // Windowless — otherwise every agent tool call opens a PowerShell
    // console over the app window.
    suppress_window(&mut cmd);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn command: {e}"))?;

    let stdout_handle = child.stdout.take();
    let stderr_handle = child.stderr.take();
    // Cap what we read from the pipes too — a command spewing gigabytes must
    // not balloon memory even though we truncate later for the model.
    let t_out = thread::spawn(move || {
        stdout_handle
            .map(|h| drain_capped(h, CAP + 4096))
            .unwrap_or_default()
    });
    let t_err = thread::spawn(move || {
        stderr_handle
            .map(|h| drain_capped(h, CAP + 4096))
            .unwrap_or_default()
    });

    let timeout = Duration::from_secs(timeout_secs.unwrap_or(120).clamp(1, 900));
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(st)) => break Some(st),
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    break None;
                }
                thread::sleep(Duration::from_millis(50));
            }
            Err(e) => return Err(format!("Failed to wait for command: {e}")),
        }
    };

    let stdout = t_out.join().unwrap_or_default();
    let stderr = t_err.join().unwrap_or_default();

    // Truncate on a UTF-8 char boundary — slicing raw bytes mid-multibyte
    // character panicked the app whenever PowerShell output contained
    // non-ASCII (unicode arrows, npm warnings, em-dashes…).
    let cap = |s: String| -> String {
        if s.len() <= CAP {
            return s;
        }
        let mut cut = CAP;
        while cut > 0 && !s.is_char_boundary(cut) {
            cut -= 1;
        }
        format!("{}…[truncated]", &s[..cut])
    };

    Ok(serde_json::json!({
        "exitCode": status.and_then(|st| st.code()),
        "timedOut": status.is_none(),
        "stdout": cap(stdout),
        "stderr": cap(stderr),
    }))
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
    // Check PATH first (windowless probe)
    let mut probe = Command::new("ollama");
    probe.arg("--version");
    suppress_window(&mut probe);
    if let Ok(output) = probe.output() {
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

/// One live terminal session: PTY master (for resize) + input writer + child.
struct TermSession {
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

/// All open terminals, keyed by id. Ids are handed out monotonically.
#[derive(Default)]
struct TerminalState {
    sessions: parking_lot::Mutex<HashMap<u32, TermSession>>,
    next_id: AtomicU32,
}

/// Spawn a new shell in a fresh PTY and stream its output to the frontend.
#[tauri::command]
fn terminal_create(
    app: tauri::AppHandle,
    state: tauri::State<'_, TerminalState>,
    cwd: Option<String>,
) -> Result<u32, String> {
    let id = state.next_id.fetch_add(1, Ordering::SeqCst);

    let pty_system = NativePtySystem::default();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open pty: {e}"))?;

    let shell_cmd = if cfg!(target_os = "windows") {
        "powershell.exe"
    } else if cfg!(target_os = "macos") {
        "/bin/zsh"
    } else {
        "/bin/bash"
    };
    let mut cmd = CommandBuilder::new(shell_cmd);
    cmd.env("TERM", "xterm-256color");
    if let Some(dir) = cwd {
        let p = PathBuf::from(&dir);
        if p.is_dir() {
            cmd.cwd(p);
        }
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {e}"))?;
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone pty reader: {e}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to take pty writer: {e}"))?;

    state.sessions.lock().insert(
        id,
        TermSession {
            master: pair.master,
            writer,
            child,
        },
    );

    // Stream this terminal's output back, tagged with its id.
    let handle = app.clone();
    thread::spawn(move || {
        let mut buffer = [0u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(n) => {
                    let text = String::from_utf8_lossy(&buffer[..n]).to_string();
                    let _ = handle.emit("pty-data", serde_json::json!({ "id": id, "data": text }));
                }
                Err(_) => break,
            }
        }
        // Process ended — clean the session up.
        if let Some(state) = handle.try_state::<TerminalState>() {
            state.sessions.lock().remove(&id);
        }
    });

    Ok(id)
}

/// Write user keystrokes into a specific terminal's shell.
#[tauri::command]
fn terminal_write(state: tauri::State<'_, TerminalState>, id: u32, data: String) {
    if let Some(session) = state.sessions.lock().get_mut(&id) {
        let _ = session.writer.write_all(data.as_bytes());
        let _ = session.writer.flush();
    }
}

/// Resize a terminal's PTY grid (called after xterm fit).
#[tauri::command]
fn terminal_resize(
    state: tauri::State<'_, TerminalState>,
    id: u32,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    state
        .sessions
        .lock()
        .get(&id)
        .ok_or_else(|| format!("terminal {id} not found"))?
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to resize terminal: {e}"))
}

/// Kill a terminal session (closes the reader thread via EOF).
#[tauri::command]
fn terminal_kill(state: tauri::State<'_, TerminalState>, id: u32) {
    if let Some(mut session) = state.sessions.lock().remove(&id) {
        let _ = session.child.kill();
        // `master` drops here, closing the pty and ending the reader thread.
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .manage(ServerState(Mutex::new(None)))
        .manage(TerminalState::default())
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
            fs_rename,
            run_command,
            terminal_create,
            terminal_write,
            terminal_resize,
            terminal_kill
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
