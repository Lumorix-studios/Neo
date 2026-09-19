import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";

const INGEST = "http://127.0.0.1:7443/ingest/d4dbbf5f-7ae0-41df-8b66-abd1f6a3c703";
const FILE = "C:/Users/madyx/AgenticCoder/debug-919218.log";
const SESSION = "919218";

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
    sessionId: SESSION,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  const body = JSON.stringify(payload);
  fetch(INGEST, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": SESSION },
    body,
  }).catch(() => {});
  tauriFetch(INGEST, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": SESSION },
    body,
  }).catch(() => {});
  const line = body + String.fromCharCode(10);
  invoke("fs_append_file", { path: FILE, content: line }).catch(() => {});
}
