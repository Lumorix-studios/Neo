import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";

// Local debug ingest endpoint — fire-and-forget; all failures are silently
// swallowed so debug logging never affects app behavior. The endpoint only
// exists while a local debug session is running.
const INGEST = "http://127.0.0.1:7279/ingest/a98f2217-f136-45e1-8320-be7e702db860";
// Relative path so the log lands next to the project instead of a hardcoded
// absolute user directory.
const FILE = "debug-d3490d.log";

/**
 * Debug-session logger: posts to the local ingest server (both webview fetch
 * and Tauri HTTP plugin, since the webview may block localhost CORS) and
 * appends an NDJSON line to a local file via the Tauri fs command.
 */
export function debugLog(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>
): void {
  const payload = {
    sessionId: "d3490d",
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  const body = JSON.stringify(payload);
  fetch(INGEST, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d3490d" },
    body,
  }).catch(() => {});
  tauriFetch(INGEST, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d3490d" },
    body,
  }).catch(() => {});
  const line = body + String.fromCharCode(10);
  invoke("fs_append_file", { path: FILE, content: line }).catch(() => {});
}