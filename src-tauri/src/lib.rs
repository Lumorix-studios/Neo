use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
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

/// A server this app is responsible for stopping.
enum TrackedServer {
    /// Spawned by this session: live child handle + PID.
    Child(Child, u32),
    /// Orphan from a previous app session, adopted via the PID record. There
    /// is no child handle, but the process tree can still be killed by PID.
    Adopted(u32),
}

/// Track the Ollama server we are responsible for so we can stop it later.
struct ServerState(Mutex<Option<TrackedServer>>);

/// Set while `start_ollama_server` spawns + waits, so concurrent callers
/// (the local-models panel and the model-switch guard) can't double-spawn:
/// the second spawn would overwrite the first one's live child handle with
/// the dead "bind: address already in use" loser.
static SERVER_STARTING: AtomicBool = AtomicBool::new(false);

/// Result of `start_ollama_server`. Tells the UI exactly what happened so it
/// never claims "started" when the port was actually served by something else
/// (the Ollama tray app, another tool, or an orphan from a previous session).
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct OllamaStartStatus {
    /// An Ollama server is reachable on port 11434.
    running: bool,
    /// It was already running before this call — we did not spawn a process.
    already_running: bool,
    /// True when the running server belongs to this app session. If false the
    /// server was started outside the app and "Stop" must not kill it.
    owned: bool,
    /// True when the server is an orphan left behind by a previous session of
    /// this app that we re-adopted — "Stop" works on it again.
    adopted: bool,
}

/// Result of `stop_ollama_server`.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct OllamaStopStatus {
    /// A server owned by this app was stopped.
    stopped: bool,
    /// A server is still listening on 11434 but was started outside the app.
    still_running_external: bool,
}

/// True when an Ollama server answers on port 11434.
fn ollama_port_responds() -> bool {
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

// ---------------------------------------------------------------------------
// Owned-server bookkeeping
//
// The packaged exe can die without a clean exit (crash, Task Manager kill,
// Windows shutdown). `RunEvent::Exit` never fires in those cases, so the
// spawned `ollama serve` survives as an orphan holding port 11434. The next
// session used to see the port up, have no tracked child, and report the
// server as "external" — leaving the user with a server the app refuses to
// stop. The PID record file below fixes that: every spawn records its PID,
// and the next session adopts (and can stop) an orphan that is still ours.
// ---------------------------------------------------------------------------

/// Where the PID of the server we spawned is recorded (a plain number).
fn server_record_file(app: &tauri::AppHandle) -> Option<PathBuf> {
    data_dir(app).ok().map(|d| d.join("ollama_server.pid"))
}

fn record_pid(app: &tauri::AppHandle, pid: u32) {
    if let Some(file) = server_record_file(app) {
        if let Some(dir) = file.parent() {
            let _ = fs::create_dir_all(dir);
        }
        let _ = fs::write(&file, pid.to_string());
    }
}

fn recorded_pid(app: &tauri::AppHandle) -> Option<u32> {
    let file = server_record_file(app)?;
    fs::read_to_string(file).ok()?.trim().parse::<u32>().ok()
}

fn clear_pid_record(app: &tauri::AppHandle) {
    if let Some(file) = server_record_file(app) {
        let _ = fs::remove_file(file);
    }
}

/// True when the PID belongs to a live `ollama` process (windowless probes).
fn pid_is_ollama(pid: u32) -> bool {
    #[cfg(windows)]
    {
        let mut probe = Command::new("tasklist");
        probe.args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"]);
        probe.stdout(Stdio::piped()).stderr(Stdio::null());
        suppress_window(&mut probe);
        probe
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_lowercase().contains("ollama"))
            .unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        let mut probe = Command::new("ps");
        probe.args(["-p", &pid.to_string(), "-o", "comm="]);
        probe
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_lowercase().contains("ollama"))
            .unwrap_or(false)
    }
}

/// PIDs of processes listening on the given TCP port. Used by "Stop" to find
/// whoever holds port 11434 when nothing of ours is running. Parsing is
/// locale-proof: only the local-address column (…:port) and the trailing PID
/// are used, never the state string (which is localized on some Windows).
fn port_listener_pids(port: u16) -> Vec<u32> {
    #[cfg(windows)]
    {
        let mut probe = Command::new("netstat");
        probe.args(["-ano", "-p", "tcp"]);
        probe.stdout(Stdio::piped()).stderr(Stdio::null());
        suppress_window(&mut probe);
        let Ok(output) = probe.output() else {
            return Vec::new();
        };
        let text = String::from_utf8_lossy(&output.stdout);
        let mut pids: Vec<u32> = Vec::new();
        for line in text.lines() {
            // Columns: Proto  Local  Foreign  State  PID (state may be
            // localized, so only rely on column count >= 4 + numeric PID).
            let cols: Vec<&str> = line.split_whitespace().collect();
            if cols.len() < 4 {
                continue;
            }
            let local = cols[1];
            let is_our_port = local
                .rsplit(':')
                .next()
                .map(|p| p == port.to_string())
                .unwrap_or(false);
            if !is_our_port {
                continue;
            }
            // The PID is the last column on netstat -ano rows.
            if let Some(last) = cols.last() {
                if let Ok(pid) = last.parse::<u32>() {
                    if pid > 0 && !pids.contains(&pid) {
                        pids.push(pid);
                    }
                }
            }
        }
        pids
    }
    #[cfg(not(windows))]
    {
        let mut probe = Command::new("lsof");
        probe.args(["-t", &format!("tcp:{port}")]);
        probe.stdout(Stdio::piped()).stderr(Stdio::null());
        suppress_window(&mut probe);
        let Ok(output) = probe.output() else {
            return Vec::new();
        };
        String::from_utf8_lossy(&output.stdout)
            .split_whitespace()
            .filter_map(|t| t.parse::<u32>().ok())
            .collect()
    }
}

/// Kill a process and, on Windows, its whole child tree. Plain
/// `Child::kill()` leaves the model-runner children of `ollama serve` behind.
fn kill_pid_tree(pid: u32) {
    #[cfg(windows)]
    {
        let mut killer = Command::new("taskkill");
        killer.args(["/PID", &pid.to_string(), "/T", "/F"]);
        killer.stdout(Stdio::null()).stderr(Stdio::null());
        suppress_window(&mut killer);
        let _ = killer.status();
    }
    #[cfg(not(windows))]
    {
        let mut killer = Command::new("kill");
        killer.arg("-9").arg(pid.to_string());
        let _ = killer.status();
    }
}

/// True when the server's model-list endpoint answers. `/api/version` alone
/// can be answered by a wedged or orphaned server while every real model
/// call fails, so "started" must mean this works too.
fn ollama_models_endpoint_ok(client: &reqwest::blocking::Client) -> bool {
    client
        .get("http://127.0.0.1:11434/api/tags")
        .send()
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

/// Drop dead tracked-server entries, reporting whether a live one remains.
/// A stored child can die at any time (e.g. it failed to bind because another
/// program held port 11434) — a stale handle would make "stop" silently do
/// nothing and "start" spawn duplicates. Adopted PIDs are re-verified too.
fn refresh_tracked(state: &ServerState) -> bool {
    let Ok(mut guard) = state.0.lock() else {
        return false;
    };
    match guard.take() {
        Some(TrackedServer::Child(mut child, pid)) => match child.try_wait() {
            // Still running — we own the live server.
            Ok(None) => {
                *guard = Some(TrackedServer::Child(child, pid));
                true
            }
            // Exited already (or can't tell) — drop the stale handle.
            _ => false,
        },
        Some(TrackedServer::Adopted(pid)) => {
            if pid_is_ollama(pid) {
                *guard = Some(TrackedServer::Adopted(pid));
                true
            } else {
                false
            }
        }
        None => false,
    }
}

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
    ollama_port_responds()
}

/// Start the Ollama server as a background process.
///
/// Never blindly spawns a duplicate: if something already serves Ollama on
/// port 11434 the app connects to it. That server is either ours (tracked
/// child → owned), an orphan from a previous session (recognized through the
/// PID record → adopted, so "Stop" works again), or genuinely external (the
/// Ollama tray app, another tool → reused but reported as external so "Stop"
/// won't kill it). When we do spawn, we wait until the server actually
/// answers both its version and model-list endpoints — `ollama serve` exits
/// immediately when the port is taken by a non-Ollama program, and reporting
/// "started" in that case broke every model call that followed.
#[tauri::command]
fn start_ollama_server(
    app: tauri::AppHandle,
    state: tauri::State<'_, ServerState>,
) -> Result<OllamaStartStatus, String> {
    // Serialize: two concurrent starts would spawn twice and the second store
    // would overwrite the first one's live child handle with the dead
    // "bind: address already in use" loser.
    if SERVER_STARTING
        .compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed)
        .is_err()
    {
        // Another start is in flight — wait for it to settle, then report.
        for _ in 0..60 {
            thread::sleep(std::time::Duration::from_millis(250));
            if !SERVER_STARTING.load(Ordering::Relaxed) {
                break;
            }
        }
        let owned = refresh_tracked(&state);
        return Ok(OllamaStartStatus {
            running: ollama_port_responds(),
            already_running: true,
            owned,
            adopted: false,
        });
    }
    let result = do_start_ollama(&app, &state);
    SERVER_STARTING.store(false, Ordering::Release);
    result
}

fn do_start_ollama(
    app: &tauri::AppHandle,
    state: &ServerState,
) -> Result<OllamaStartStatus, String> {
    // Drop a stale child handle if the previously-spawned child already died.
    let owned = refresh_tracked(state);

    // If an Ollama server is already up, reuse it — spawning a second one
    // would die with "bind: address already in use" and corrupt our state.
    if ollama_port_responds() {
        if owned {
            return Ok(OllamaStartStatus {
                running: true,
                already_running: true,
                owned: true,
                adopted: false,
            });
        }
        // No live server of ours, yet the port answers. It may be an orphan
        // left behind by a previous session of this app (the exe can die
        // without a clean exit). The PID record written when we spawned
        // tells us — adopt it so "Stop" works again instead of telling the
        // user to close a server they have no window or tray icon for.
        if let Some(pid) = recorded_pid(app) {
            if pid_is_ollama(pid) {
                if let Ok(mut guard) = state.0.lock() {
                    *guard = Some(TrackedServer::Adopted(pid));
                }
                return Ok(OllamaStartStatus {
                    running: true,
                    already_running: true,
                    owned: true,
                    adopted: true,
                });
            }
            // Stale record for a process that is gone — clear it.
            clear_pid_record(app);
        }
        // Genuinely external (the Ollama tray app, another tool) — reuse only.
        return Ok(OllamaStartStatus {
            running: true,
            already_running: true,
            owned: false,
            adopted: false,
        });
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
    let pid = child.id();

    // Record the PID so a future session can adopt (or stop) this server if
    // this session dies without a clean exit (crash, Task Manager, shutdown).
    record_pid(app, pid);

    // Store the child process so we can stop it later
    if let Ok(mut guard) = state.0.lock() {
        *guard = Some(TrackedServer::Child(child, pid));
    }

    // Wait (up to ~15s) for the server to bind and answer. Bail out early if
    // the process dies — that's how "address already in use" manifests.
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_millis(1500))
        .build()
        .ok();
    for _ in 0..30 {
        thread::sleep(std::time::Duration::from_millis(500));
        if let Some(c) = &client {
            let version_ok = c
                .get("http://127.0.0.1:11434/api/version")
                .send()
                .map(|r| r.status().is_success())
                .unwrap_or(false);
            // "Started" must mean the server can actually serve models, not
            // just answer a version ping — a wedged/orphaned server can do
            // the latter while every model call fails.
            if version_ok && ollama_models_endpoint_ok(c) {
                return Ok(OllamaStartStatus {
                    running: true,
                    already_running: false,
                    owned: true,
                    adopted: false,
                });
            }
        }
        let died = {
            let mut guard = state
                .0
                .lock()
                .map_err(|e| format!("State lock error: {e}"))?;
            match guard.as_mut() {
                Some(TrackedServer::Child(child, _)) => {
                    matches!(child.try_wait(), Ok(Some(_)) | Err(_))
                }
                _ => true,
            }
        };
        if died {
            // Clean up the dead handle + stale record so the next start
            // isn't confused.
            if let Ok(mut guard) = state.0.lock() {
                *guard = None;
            }
            clear_pid_record(app);
            return Err(
                "The Ollama server exited right after starting. Port 11434 is likely used by \
                 another program (check with: netstat -ano | findstr 11434), or the Ollama \
                 install is broken."
                    .into(),
            );
        }
    }

    // Server didn't come up in time — kill it (and its tree) and report the
    // failure honestly.
    {
        let mut guard = state.0.lock().map_err(|e| format!("State lock error: {e}"))?;
        if let Some(TrackedServer::Child(mut child, pid)) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
            kill_pid_tree(pid);
        }
    }
    clear_pid_record(app);
    Err("The Ollama server did not respond on port 11434 within 15 seconds.".into())
}

/// Stop the Ollama server on port 11434. The app's own servers (spawned or
/// adopted) are stopped directly; any other Ollama process listening on the
/// port (the Ollama tray app's server, an orphan whose PID record was lost)
/// is found via netstat and stopped too — "Stop" should never leave an
/// Ollama server the user cannot reach running. A port held by a process
/// that is not Ollama is left alone and reported as external.
#[tauri::command]
fn stop_ollama_server(
    app: tauri::AppHandle,
    state: tauri::State<'_, ServerState>,
) -> Result<OllamaStopStatus, String> {
    let killed = {
        let mut guard = state.0.lock().map_err(|e| format!("State lock error: {e}"))?;
        match guard.take() {
            Some(TrackedServer::Child(mut child, pid)) => {
                let was_running = matches!(child.try_wait(), Ok(None));
                let _ = child.kill();
                let _ = child.wait();
                // `kill()` doesn't take the process tree with it — the server
                // keeps model-runner children alive. Reap the whole tree.
                kill_pid_tree(pid);
                was_running
            }
            Some(TrackedServer::Adopted(pid)) => {
                kill_pid_tree(pid);
                true
            }
            None => false,
        }
    };
    if killed {
        clear_pid_record(&app);
        // Report accurately once the port is actually released.
        for _ in 0..10 {
            if !ollama_port_responds() {
                return Ok(OllamaStopStatus {
                    stopped: true,
                    still_running_external: false,
                });
            }
            thread::sleep(std::time::Duration::from_millis(300));
        }
        return Ok(OllamaStopStatus {
            stopped: true,
            still_running_external: false,
        });
    }
    // Nothing tracked this session. An orphan from a previous session may
    // still hold the port — if the PID record names a live ollama process,
    // it is ours: stop it instead of telling the user to close something
    // they have no window or tray icon for.
    if let Some(pid) = recorded_pid(&app) {
        if pid_is_ollama(pid) {
            kill_pid_tree(pid);
            clear_pid_record(&app);
            for _ in 0..10 {
                if !ollama_port_responds() {
                    break;
                }
                thread::sleep(std::time::Duration::from_millis(300));
            }
            return Ok(OllamaStopStatus {
                stopped: true,
                still_running_external: false,
            });
        }
        // Stale record for a process that is gone — clear it.
        clear_pid_record(&app);
    }
    // Nothing of ours is running (or the PID record didn't match), yet the
    // port still answers. Find whoever is listening on 11434 and stop it
    // when it is an Ollama process — that covers the Ollama tray app's own
    // server and any orphan whose PID record was lost. The user pressed
    // "Stop"; leaving a server they cannot reach running helps nobody.
    // Only a non-Ollama program squatting on the port is left alone.
    let mut killed_external_ollama = false;
    for pid in port_listener_pids(11434) {
        if pid_is_ollama(pid) {
            kill_pid_tree(pid);
            killed_external_ollama = true;
        }
    }
    if killed_external_ollama {
        clear_pid_record(&app);
        for _ in 0..10 {
            if !ollama_port_responds() {
                break;
            }
            thread::sleep(std::time::Duration::from_millis(300));
        }
        return Ok(OllamaStopStatus {
            stopped: true,
            still_running_external: false,
        });
    }
    // A server still listening now was NOT started by Ollama (or could not
    // be identified) — don't touch processes we can't vouch for.
    let still_running_external = ollama_port_responds();
    Ok(OllamaStopStatus {
        stopped: false,
        still_running_external,
    })
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

/// Replace exact occurrence(s) of `search` with `replace` in a file.
/// Replaces the first occurrence, or every occurrence when `all` is true.
#[tauri::command]
fn fs_replace_in_file(
    path: String,
    search: String,
    replace: String,
    all: Option<bool>,
) -> Result<bool, String> {
    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read {path}: {e}"))?;
    if !content.contains(&search) {
        return Err(format!("Search text not found in {path}"));
    }
    let count = if all.unwrap_or(false) {
        content.matches(&search).count()
    } else {
        1
    };
    let updated = content.replacen(&search, &replace, count);
    fs::write(&path, updated).map_err(|e| format!("Failed to write {path}: {e}"))?;
    Ok(true)
}

/// Permanently delete a file.
#[tauri::command]
fn fs_delete_file(path: String) -> Result<bool, String> {
    fs::remove_file(&path).map_err(|e| format!("Failed to delete {path}: {e}"))?;
    Ok(true)
}

/// Stat a path: type, byte size and modification time (unix ms).
#[tauri::command]
fn fs_stat(path: String) -> Result<serde_json::Value, String> {
    let meta = fs::metadata(&path).map_err(|e| format!("Failed to stat {path}: {e}"))?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64);
    Ok(serde_json::json!({
        "path": path,
        "isDir": meta.is_dir(),
        "size": if meta.is_dir() { serde_json::Value::Null } else { serde_json::json!(meta.len()) },
        "modified": modified,
    }))
}

/// Copy a file to a new location (creates parent folders of the destination).
#[tauri::command]
fn fs_copy_file(path: String, new_path: String) -> Result<bool, String> {
    if let Some(parent) = std::path::Path::new(&new_path).parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::copy(&path, &new_path)
        .map_err(|e| format!("Failed to copy {path} → {new_path}: {e}"))?;
    Ok(true)
}

/// Replace an inclusive line range with new content. `end_line = 0` means
/// "from start_line to EOF". Returns the new file size in bytes.
#[tauri::command]
fn fs_write_file_range(
    path: String,
    start_line: usize,
    end_line: usize,
    content: String,
) -> Result<usize, String> {
    let text = fs::read_to_string(&path).map_err(|e| format!("Failed to read {path}: {e}"))?;
    let nl: &str = if text.contains("\r\n") { "\r\n" } else { "\n" };
    let lines: Vec<&str> = text.split(nl).collect();
    let start = start_line.max(1).saturating_sub(1); // 1-based → 0-based
    let end = if end_line == 0 {
        lines.len()
    } else {
        end_line.min(lines.len())
    };
    let start = start.min(end);
    let replacement: Vec<&str> = content.split('\n').collect();
    let mut out: Vec<&str> = Vec::with_capacity(lines.len() - (end - start) + replacement.len());
    out.extend_from_slice(&lines[..start]);
    out.extend_from_slice(&replacement);
    out.extend_from_slice(&lines[end..]);
    let mut joined = out.join(nl);
    // Preserve a trailing newline when the replaced range reached EOF and the
    // original file ended with one.
    if end == lines.len() && text.ends_with(nl) && !joined.ends_with(nl) {
        joined.push_str(nl);
    }
    fs::write(&path, &joined).map_err(|e| format!("Failed to write {path}: {e}"))?;
    Ok(joined.len())
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
    //hardest lang ive ever learned

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

// ─── MCP stdio transport ────────────────────────────────────────────────────────
// Persistent stdio sessions for MCP servers run as local commands — the standard
// MCP stdio transport: one JSON-RPC message per line on stdin/stdout. Each
// server process is kept alive across calls and torn down on stop/remove.
//
// Compatibility / robustness notes:
//  • `%VAR%` (Windows) and `$VAR` / `${VAR}` (POSIX) refs in the command, args
//    and cwd are expanded from the environment, so configs like
//    `%LOCALAPPDATA%\Roblox\mcp.bat` work as typed.
//  • Extension-less commands (`npx`, `node`, `python`…) are resolved against
//    PATH; on Windows an `.exe` is spawned directly while `.cmd`/`.bat` shims
//    (npm-style) are routed through `cmd.exe /c`.
//  • `.bat`/`.cmd` targets are always executed via `cmd.exe /c`.
//  • stderr is captured (capped ring of the last N lines) so a crashing server
//    reports *why* it died instead of a bare "pipe is being closed" (os error
//    232 on Windows).

use std::collections::VecDeque;
use std::io::BufRead;
use std::process::ChildStdin;
use std::sync::mpsc::{self, Receiver};
use std::sync::Arc;

/// stdin/stdout child plumbing — locked separately so a read poll never blocks
/// a send on the session map.
struct McpProcIo {
    child: Child,
    stdin: ChildStdin,
}

struct McpProc {
    io: Mutex<McpProcIo>,
    /// stdout lines pushed by the reader thread (bounded backlog). The
    /// receiver is behind a mutex so the whole struct stays `Sync` (required
    /// for Tauri managed state) while still allowing blocking waits.
    rx: Mutex<Receiver<String>>,
    /// Last N stderr lines, kept for crash diagnostics.
    stderr_tail: Arc<Mutex<VecDeque<String>>>,
}

struct McpState(Mutex<HashMap<String, Arc<McpProc>>>);

/// Maximum stderr lines kept for diagnostics.
const STDERR_TAIL_LINES: usize = 40;
/// Maximum characters kept per captured stderr line.
const STDERR_LINE_MAX: usize = 2000;

/// Expand `%VAR%` (Windows) and `$VAR` / `${VAR}` (POSIX) references from the
/// environment. Unknown variables are left as written.
fn expand_env_vars(input: &str) -> String {
    if !input.contains('%') && !input.contains('$') {
        return input.to_string();
    }
    let chars: Vec<char> = input.chars().collect();
    let mut out = String::with_capacity(input.len());
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        let (name, skip): (Option<String>, usize) = if c == '%' {
            match chars[i + 1..].iter().position(|&ch| ch == '%') {
                Some(end) if end > 0 => {
                    let name: String = chars[i + 1..i + 1 + end].iter().collect();
                    (Some(name), end + 2)
                }
                _ => (None, 0),
            }
        } else if c == '$' && i + 1 < chars.len() && chars[i + 1] == '{' {
            match chars[i + 2..].iter().position(|&ch| ch == '}') {
                Some(end) if end > 0 => {
                    let name: String = chars[i + 2..i + 2 + end].iter().collect();
                    (Some(name), end + 3)
                }
                _ => (None, 0),
            }
        } else if c == '$' {
            let end = chars[i + 1..]
                .iter()
                .take_while(|ch| ch.is_ascii_alphanumeric() || **ch == '_')
                .count();
            if end > 0 {
                let name: String = chars[i + 1..i + 1 + end].iter().collect();
                (Some(name), end + 1)
            } else {
                (None, 0)
            }
        } else {
            (None, 0)
        };
        if let Some(name) =
            name.filter(|n| n.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '_'))
        {
            if let Ok(val) = std::env::var(&name) {
                out.push_str(&val);
                i += skip;
                continue;
            }
        }
        out.push(c);
        i += 1;
    }
    out
}

/// Resolve `command` to a spawnable program. Returns the program plus any
/// front args (e.g. `cmd /c`). Handles bare names (`npx`), full paths,
/// `.bat`/`.cmd` files and `%VAR%`-expanded paths.
#[cfg(windows)]
fn resolve_command(command: &str) -> (String, Vec<String>) {
    let expanded = expand_env_vars(command);
    let lower = expanded.to_lowercase();
    if lower.ends_with(".bat") || lower.ends_with(".cmd") {
        return ("cmd.exe".to_string(), vec!["/c".to_string(), expanded]);
    }
    if Path::new(&expanded).extension().is_some() {
        return (expanded, Vec::new());
    }
    // Extension-less: search the cwd, then PATH, for the real shim. `.exe`
    // spawns directly; `.cmd`/`.bat` shims (npm-style) need `cmd.exe /c`.
    let path_var = std::env::var("PATH").unwrap_or_default();
    let dirs = std::env::current_dir().into_iter().chain(
        path_var
            .split(';')
            .filter(|d| !d.is_empty())
            .map(PathBuf::from),
    );
    for dir in dirs {
        for ext in [".exe", ".cmd", ".bat"] {
            let candidate = dir.join(format!("{expanded}{ext}"));
            if candidate.is_file() {
                let cand = candidate.to_string_lossy().into_owned();
                if ext == ".exe" {
                    return (cand, Vec::new());
                }
                return ("cmd.exe".to_string(), vec!["/c".to_string(), cand]);
            }
        }
    }
    (expanded, Vec::new())
}

/// Non-Windows: expand env references and spawn directly.
#[cfg(not(windows))]
fn resolve_command(command: &str) -> (String, Vec<String>) {
    (expand_env_vars(command), Vec::new())
}

/// Join the captured stderr tail into a single diagnostic string.
fn stderr_dump(tail: &Mutex<VecDeque<String>>) -> String {
    match tail.lock() {
        Ok(g) => g
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>()
            .join("\n"),
        Err(_) => String::new(),
    }
}

/// Explain why a stdio MCP server stopped producing output, if it exited.
fn describe_exit(child: &mut Child, tail: &Mutex<VecDeque<String>>) -> String {
    match child.try_wait() {
        Ok(Some(status)) => {
            let err = stderr_dump(tail);
            if err.is_empty() {
                format!("The server process has exited ({status}).")
            } else {
                format!("The server process has exited ({status}). stderr:\n{err}")
            }
        }
        _ => String::new(),
    }
}

/// Kill and reap a session's child process.
fn kill_proc(proc: &McpProc) {
    let mut io = match proc.io.lock() {
        Ok(g) => g,
        Err(poisoned) => poisoned.into_inner(),
    };
    let _ = io.child.kill();
    let _ = io.child.wait();
}

#[tauri::command]
fn mcp_stdio_start(
    state: tauri::State<'_, McpState>,
    id: String,
    command: String,
    args: Vec<String>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
) -> Result<(), String> {
    // Tear down any previous process registered under this id.
    {
        let mut guard = state.0.lock().map_err(|e| format!("State lock error: {e}"))?;
        if let Some(old) = guard.remove(&id) {
            kill_proc(&old);
        }
    }

    // Windows shell compatibility: expand env refs, resolve shims, route
    // .bat/.cmd files through cmd.exe.
    let (program, front_args) = resolve_command(&command);
    let args: Vec<String> = args.iter().map(|a| expand_env_vars(a)).collect();

    let mut cmd = Command::new(&program);
    cmd.args(front_args.iter().chain(args.iter()))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        // Capture stderr — a crashing server must be able to say why.
        .stderr(Stdio::piped());
    if let Some(dir) = &cwd {
        let expanded = expand_env_vars(dir);
        let p = PathBuf::from(&expanded);
        if p.is_dir() {
            cmd.current_dir(&p);
        } else {
            return Err(format!("MCP server cwd does not exist: {expanded}"));
        }
    }
    if let Some(vars) = &env {
        for (k, v) in vars {
            cmd.env(k, v);
        }
    }
    suppress_window(&mut cmd);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start MCP server \"{command}\": {e}"))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Failed to open MCP server stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to open MCP server stdout".to_string())?;
    let stderr = child.stderr.take();

    // Reader thread: pushes complete lines into a channel with a bounded
    // backlog so a chatty server can't grow memory without bound.
    let (tx, rx) = mpsc::sync_channel::<String>(512);
    thread::spawn(move || {
        let mut reader = std::io::BufReader::new(stdout);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    let trimmed = line.trim_end_matches(['\r', '\n']).to_string();
                    if trimmed.is_empty() || tx.send(trimmed).is_err() {
                        break;
                    }
                }
            }
        }
    });

    // stderr capture: a small ring buffer of the last lines, so a crash can
    // be diagnosed after the fact (this turns "os error 232" into a readable
    // error message in the UI).
    let stderr_tail: Arc<Mutex<VecDeque<String>>> = Arc::new(Mutex::new(VecDeque::new()));
    if let Some(stderr) = stderr {
        let tail = Arc::clone(&stderr_tail);
        thread::spawn(move || {
            let reader = std::io::BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                let capped: String = line.chars().take(STDERR_LINE_MAX).collect();
                if let Ok(mut guard) = tail.lock() {
                    while guard.len() >= STDERR_TAIL_LINES {
                        guard.pop_front();
                    }
                    guard.push_back(capped);
                }
            }
        });
    }

    state
        .0
        .lock()
        .map_err(|e| format!("State lock error: {e}"))?
        .insert(
            id,
            Arc::new(McpProc {
                io: Mutex::new(McpProcIo { child, stdin }),
                rx: Mutex::new(rx),
                stderr_tail,
            }),
        );
    Ok(())
}

/// Write one JSON-RPC line into the server's stdin.
#[tauri::command]
fn mcp_stdio_send(
    state: tauri::State<'_, McpState>,
    id: String,
    line: String,
) -> Result<(), String> {
    // Clone the session Arc out of the map, then release the map lock — a
    // slow/blocked read poll elsewhere must never stall a send.
    let session = {
        let guard = state.0.lock().map_err(|e| format!("State lock error: {e}"))?;
        guard
            .get(&id)
            .cloned()
            .ok_or_else(|| format!("MCP stdio session {id} is not running"))?
    };
    let write_result = {
        let mut io = session
            .io
            .lock()
            .map_err(|_| "MCP stdio session lock poisoned".to_string())?;
        io.stdin
            .write_all(line.as_bytes())
            .and_then(|_| io.stdin.write_all(b"\n"))
            .and_then(|_| io.stdin.flush())
    };
    if let Err(e) = write_result {
        // The classic "The pipe is being closed (os error 232)" — the server
        // process died. Explain why while we still hold the child handle.
        let detail = {
            let mut io = session
                .io
                .lock()
                .map_err(|_| "MCP stdio session lock poisoned".to_string())?;
            describe_exit(&mut io.child, &session.stderr_tail)
        };
        // The session is dead; drop it so the next start starts clean.
        if let Ok(mut guard) = state.0.lock() {
            if let Some(old) = guard.remove(&id) {
                kill_proc(&old);
            }
        }
        return Err(format!("Failed to write to MCP server: {e}. {detail}"));
    }
    Ok(())
}

/// Read the next stdout line from the server, waiting up to `timeout_ms`.
/// Returns `None` on timeout (the caller re-polls until its own deadline).
#[tauri::command]
fn mcp_stdio_read(
    state: tauri::State<'_, McpState>,
    id: String,
    timeout_ms: u64,
) -> Result<Option<String>, String> {
    // Clone the session Arc out of the map, then release the map lock — the
    // blocking wait below never blocks sends, starts or stops.
    let session = {
        let guard = state.0.lock().map_err(|e| format!("State lock error: {e}"))?;
        guard
            .get(&id)
            .cloned()
            .ok_or_else(|| format!("MCP stdio session {id} is not running"))?
    };
    let wait_result = {
        let rx = match session.rx.lock() {
            Ok(g) => g,
            Err(poisoned) => poisoned.into_inner(),
        };
        rx.recv_timeout(std::time::Duration::from_millis(timeout_ms))
    };
    match wait_result {
        Ok(line) => Ok(Some(line)),
        Err(mpsc::RecvTimeoutError::Timeout) => Ok(None),
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            // stdout closed: the server exited (or closed its stdout). Report
            // exit code + captured stderr instead of making the caller poll
            // until its own timeout with no explanation.
            let detail = {
                let mut io = session
                    .io
                    .lock()
                    .map_err(|_| "MCP stdio session lock poisoned".to_string())?;
                describe_exit(&mut io.child, &session.stderr_tail)
            };
            Err(format!("MCP server stopped producing output. {detail}"))
        }
    }
}

/// Kill and forget a stdio MCP server process.
#[tauri::command]
fn mcp_stdio_stop(state: tauri::State<'_, McpState>, id: String) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| format!("State lock error: {e}"))?;
    if let Some(session) = guard.remove(&id) {
        kill_proc(&session);
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .manage(ServerState(Mutex::new(None)))
        .manage(TerminalState::default())
        .manage(McpState(Mutex::new(HashMap::new())))
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
            fs_stat,
            fs_copy_file,
            fs_write_file_range,
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
            terminal_kill,
            mcp_stdio_start,
            mcp_stdio_send,
            mcp_stdio_read,
            mcp_stdio_stop
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
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // When the app exits, stop the Ollama server we spawned (and any
            // orphan we adopted). Without this the server outlives the window
            // as an orphan, keeps holding port 11434, and the next launch
            // silently "adopts" a process it can't control — which is exactly
            // the overlap bug. Note: this only runs on a clean exit; a crash
            // or Task Manager kill is handled by the PID record instead.
            if let tauri::RunEvent::Exit = event {
                let state = app_handle.state::<ServerState>();
                if let Ok(mut guard) = state.0.lock() {
                    match guard.take() {
                        Some(TrackedServer::Child(mut child, pid)) => {
                            let _ = child.kill();
                            let _ = child.wait();
                            kill_pid_tree(pid);
                        }
                        Some(TrackedServer::Adopted(pid)) => kill_pid_tree(pid),
                        None => {}
                    }
                }
                clear_pid_record(app_handle);
            }
        });
}
