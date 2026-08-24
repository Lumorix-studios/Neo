/**
 * Minimal MCP (Model Context Protocol) client over the Streamable HTTP
 * transport. Servers are configured by URL; each agent run performs a fresh
 * `initialize` → `tools/list` handshake and executes tools via `tools/call`.
 *
 * Config is stored locally under "neochat.mcp.v1".
 */

export interface McpServerConfig {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

export interface McpToolInfo {
  name: string;
  description: string;
}

const STORAGE_KEY = "neochat.mcp.v1";

// Newline char built at runtime so the source stays escape-sequence safe.
const NL = String.fromCharCode(10);

export function loadMcpServers(): McpServerConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as McpServerConfig[]) : [];
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

interface JsonRpcResponse {
  result?: unknown;
  error?: { message?: string };
}

/** POST one JSON-RPC message; handles both JSON and SSE responses. */
async function rpc(
  url: string,
  body: unknown,
  sessionId?: string | null
): Promise<{ data: JsonRpcResponse | null; session: string | null }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`MCP server returned HTTP ${res.status}`);
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

/** initialize → notifications/initialized → tools/list */
export async function listMcpTools(server: McpServerConfig): Promise<McpToolInfo[]> {
  const init = await rpc(server.url, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "Neo", version: "1.0.4" },
    },
  });
  if (init.data?.error) throw new Error(init.data.error.message ?? "MCP initialize failed");
  const session = init.session;

  await rpc(server.url, { jsonrpc: "2.0", method: "notifications/initialized" }, session).catch(
    () => undefined
  );

  const list = await rpc(server.url, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, session);
  if (list.data?.error) throw new Error(list.data.error.message ?? "MCP tools/list failed");

  const tools = ((list.data?.result as Record<string, unknown> | undefined)?.tools ?? []) as Array<
    Record<string, unknown>
  >;
  return tools.map((t) => ({
    name: String(t.name ?? ""),
    description: String(t.description ?? ""),
  }));
}

/** initialize → tools/call */
export async function callMcpTool(
  server: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ ok: boolean; output: string }> {
  try {
    const init = await rpc(server.url, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "Neo", version: "1.0.4" },
      },
    });
    if (init.data?.error) throw new Error(init.data.error.message ?? "MCP initialize failed");
    const session = init.session;

    await rpc(server.url, { jsonrpc: "2.0", method: "notifications/initialized" }, session).catch(
      () => undefined
    );

    const res = await rpc(
      server.url,
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: toolName, arguments: args } },
      session
    );
    if (res.data?.error) {
      return { ok: false, output: res.data.error.message ?? "MCP tool error" };
    }

    const result = res.data?.result as Record<string, unknown> | undefined;
    const content = (result?.content ?? []) as Array<Record<string, unknown>>;
    const text = content
      .map((c) => (typeof c.text === "string" ? c.text : JSON.stringify(c)))
      .join(NL)
      .trim();
    const isError = Boolean(result?.isError);
    return { ok: !isError, output: text || "(empty result)" };
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : String(e) };
  }
}