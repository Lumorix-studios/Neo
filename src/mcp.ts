
/**
 * Real MCP (Model Context Protocol) client — two transports:
 *
 *  • "http"  — Streamable HTTP servers (JSON-RPC over POST, optional SSE
 *              responses, Mcp-Session-Id handling). Custom request headers
 *              (e.g. Authorization) are configured per server in Settings —
 *              nothing is hardcoded.
 *  • "stdio" — local servers spawned as child processes over the standard
 *              MCP stdio transport (one JSON-RPC message per line), managed
 *              by the Rust backend (mcp_stdio_* commands).
 */
import { invoke } from "@tauri-apps/api/core";

export interface McpServerConfig {
  id: string;
  name: string;
  enabled: boolean;
  /** "http" = Streamable HTTP endpoint · "stdio" = local command process. */
  transport: "http" | "stdio";
  /** http transport: the MCP endpoint URL. */
  url?: string;
  /** http transport: extra request headers (e.g. Authorization). User-configured. */
  headers?: Record<string, string>;
  /** stdio transport: executable command (e.g. npx, python, node). */
  command?: string;
  /** stdio transport: command arguments (e.g. ["-y", "@modelcontextprotocol/server-filesystem", "C:/path"]). */
  args?: string[];
  /** stdio transport: working directory (defaults to the app's cwd). */
  cwd?: string;
  /** stdio transport: extra environment variables for the server process. */
  env?: Record<string, string>;
}

export interface McpToolInfo {
  name: string;
  description: string;
}

const STORAGE_KEY = "neochat.mcp.v2";
const LEGACY_STORAGE_KEY = "neochat.mcp.v1";

// Newline char built at runtime so the source stays escape-sequence safe.
const NL = String.fromCharCode(10);

/** Fill defaults so configs saved by older versions keep working. */
function normalizeServer(raw: unknown): McpServerConfig {
  const s = (raw ?? {}) as Partial<McpServerConfig>;
  return {
    id: String(s.id ?? makeServerId()),
    name: String(s.name ?? "Untitled server"),
    enabled: s.enabled !== false,
    transport: s.transport === "stdio" ? "stdio" : "http",
    url: typeof s.url === "string" ? s.url : undefined,
    headers:
      s.headers && typeof s.headers === "object" && !Array.isArray(s.headers)
        ? (s.headers as Record<string, string>)
        : undefined,
    command: typeof s.command === "string" ? s.command : undefined,
    args: Array.isArray(s.args) ? s.args.map(String) : undefined,
    cwd: typeof s.cwd === "string" ? s.cwd : undefined,
    env:
      s.env && typeof s.env === "object" && !Array.isArray(s.env)
        ? (s.env as Record<string, string>)
        : undefined,
  };
}

export function loadMcpServers(): McpServerConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeServer) : [];
  } catch {
    return [];
  }
}

export function saveMcpServers(servers: McpServerConfig[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
}

export function makeServerId(): string {
  return `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Human-readable target for list rows ("https://…" or `npx -y pkg`). */
export function describeServer(s: McpServerConfig): string {
  if (s.transport === "stdio") {
    return [s.command, ...(s.args ?? [])].filter(Boolean).join(" ");
  }
  return s.url ?? "";
}

interface JsonRpcResponse {
  result?: unknown;
  error?: { message?: string };
  id?: string | number | null;
}

/* ── HTTP transport (Streamable HTTP) ──────────────────────────────────────── */

/** POST one JSON-RPC message; handles both JSON and SSE responses. */
async function rpc(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  sessionId?: string | null
): Promise<{ data: JsonRpcResponse | null; session: string | null }> {
  const allHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...headers,
  };
  if (sessionId) allHeaders["Mcp-Session-Id"] = sessionId;

  const res = await fetch(url, {
    method: "POST",
    headers: allHeaders,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const text = (await res.text()).trim();
      if (text) detail = text.length > 200 ? `${text.slice(0, 200)}…` : text;
    } catch {
      /* keep status-only detail */
    }
    throw new Error(`MCP server returned ${detail}`);
  }

  const session = res.headers.get("mcp-session-id");
  const contentType = res.headers.get("content-type") ?? "";

  if (contentType.includes("text/event-stream")) {
    // Parse the last `data:` line that carries a JSON-RPC payload.
    const text = await res.text();
    let data: JsonRpcResponse | null = null;
    for (const line of text.split(NL)) {
      const t = line.trim();
      if (t.startsWith("data:")) {
        try {
          data = JSON.parse(t.slice(5).trim()) as JsonRpcResponse;
        } catch {
          /* keep last good */
        }
      }
    }
    return { data, session };
  }

  return { data: (await res.json()) as JsonRpcResponse, session };
}

/* ── stdio transport (local command servers) ───────────────────────────────── */

/** Server ids with a live, initialized stdio process on the Rust side. */
const stdioSessions = new Set<string>();

/** Ensure a stdio server process is running and initialized (handshake once). */
async function ensureStdio(server: McpServerConfig): Promise<void> {
  if (stdioSessions.has(server.id)) return;
  if (!server.command) {
    throw new Error(`MCP server "${server.name}" has no command configured`);
  }

  await invoke("mcp_stdio_start", {
    id: server.id,
    command: server.command,
    args: server.args ?? [],
    cwd: server.cwd ?? null,
    env: server.env ?? null,
  });

  const init = await stdioRpc(server, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "Neo", version: "1.0.4" },
    },
  });
  if (init.error) {
    stdioSessions.delete(server.id);
    await stopStdio(server.id);
    throw new Error(init.error.message ?? "MCP initialize failed");
  }
  // notifications/initialized — no response expected.
  await invoke("mcp_stdio_send", {
    id: server.id,
    line: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  }).catch(() => undefined);

  stdioSessions.add(server.id);
}

/** Kill a stdio server process (used on remove / on fatal errors). */
export async function stopStdio(id: string): Promise<void> {
  stdioSessions.delete(id);
  try {
    await invoke("mcp_stdio_stop", { id });
  } catch {
    /* backend session already gone */
  }
}

/** One correlated JSON-RPC request/response over stdio. */
async function stdioRpc(
  server: McpServerConfig,
  body: Record<string, unknown>
): Promise<JsonRpcResponse> {
  const wantId = body.id;
  await invoke("mcp_stdio_send", { id: server.id, line: JSON.stringify(body) });

  const deadline = Date.now() + 30_000;
  for (;;) {
    if (Date.now() > deadline) {
      throw new Error(`MCP server "${server.name}" timed out`);
    }
    const line = await invoke<string | null>("mcp_stdio_read", {
      id: server.id,
      timeoutMs: 750,
    });
    if (line == null) continue;
    let parsed: JsonRpcResponse;
    try {
      parsed = JSON.parse(line) as JsonRpcResponse;
    } catch {
      continue; // skip non-JSON noise (banners, logs)
    }
    // Skip server-initiated notifications; match our request id.
    if (wantId != null && parsed.id !== wantId) continue;
    return parsed;
  }
}

function extractTools(result: unknown): McpToolInfo[] {
  const tools = ((result as Record<string, unknown> | undefined)?.tools ?? []) as Array<
    Record<string, unknown>
  >;
  return tools.map((t) => ({
    name: String(t.name ?? ""),
    description: String(t.description ?? ""),
  }));
}

const CLIENT_INFO = { name: "Neo", version: "1.0.4" };

/** initialize → notifications/initialized → tools/list */
export async function listMcpTools(server: McpServerConfig): Promise<McpToolInfo[]> {
  if (server.transport === "stdio") {
    try {
      await ensureStdio(server);
      const list = await stdioRpc(server, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      });
      if (list.error) throw new Error(list.error.message ?? "MCP tools/list failed");
      return extractTools(list.result);
    } catch (e) {
      stdioSessions.delete(server.id); // force a fresh spawn next time
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  const headers = server.headers ?? {};
  const init = await rpc(
    server.url ?? "",
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: CLIENT_INFO },
    },
    headers
  );
  if (init.data?.error) throw new Error(init.data.error.message ?? "MCP initialize failed");
  const session = init.session;

  await rpc(
    server.url ?? "",
    { jsonrpc: "2.0", method: "notifications/initialized" },
    headers,
    session
  ).catch(() => undefined);

  const list = await rpc(
    server.url ?? "",
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    headers,
    session
  );
  if (list.data?.error) throw new Error(list.data.error.message ?? "MCP tools/list failed");

  return extractTools(list.data?.result);
}

/** Flatten a tools/call result into plain text. */
function extractToolOutput(result: unknown): string {
  const r = (result ?? {}) as Record<string, unknown>;
  const content = (r.content ?? []) as Array<Record<string, unknown>>;
  const text = content
    .map((c) => (typeof c.text === "string" ? c.text : JSON.stringify(c)))
    .join(NL)
    .trim();
  return text || "(empty result)";
}

/** initialize → tools/call */
export async function callMcpTool(
  server: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ ok: boolean; output: string }> {
  try {
    if (server.transport === "stdio") {
      try {
        await ensureStdio(server);
        const res = await stdioRpc(server, {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: toolName, arguments: args },
        });
        if (res.error) {
          return { ok: false, output: res.error.message ?? "MCP tool error" };
        }
        const isError = Boolean((res.result as Record<string, unknown> | undefined)?.isError);
        return { ok: !isError, output: extractToolOutput(res.result) };
      } catch (e) {
        stdioSessions.delete(server.id); // force a fresh spawn next call
        throw e instanceof Error ? e : new Error(String(e));
      }
    }

    const headers = server.headers ?? {};
    const init = await rpc(
      server.url ?? "",
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: CLIENT_INFO },
      },
      headers
    );
    if (init.data?.error) throw new Error(init.data.error.message ?? "MCP initialize failed");
    const session = init.session;

    await rpc(
      server.url ?? "",
      { jsonrpc: "2.0", method: "notifications/initialized" },
      headers,
      session
    ).catch(() => undefined);

    const res = await rpc(
      server.url ?? "",
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: toolName, arguments: args } },
      headers,
      session
    );
    if (res.data?.error) {
      return { ok: false, output: res.data.error.message ?? "MCP tool error" };
    }

    const isError = Boolean((res.data?.result as Record<string, unknown> | undefined)?.isError);
    return { ok: !isError, output: extractToolOutput(res.data?.result) };
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : String(e) };
  }
}