/**
 * Agentic filesystem tools.
 *
 * Tool-capable models receive native function/tool schemas (OpenAI, Anthropic,
 * Gemini, Ollama, OpenRouter, Groq). Models that only emit text still work via
 * XML / JSON fallbacks. Destructive operations require user approval.
 */
import { invoke } from "@tauri-apps/api/core";
import { debugLog } from "./debugLog";

export type ToolName =
  | "read_file"
  | "read_file_range"
  | "write_file"
  | "append_file"
  | "replace_in_file"
  | "delete_file"
  | "delete_dir"
  | "create_dir"
  | "list_dir"
  | "search_files"
  | "rename";

export interface ToolCall {
  id?: string;
  name: ToolName;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  ok: boolean;
  output: string;
}

export interface AgenticActivity {
  id: string;
  tool: ToolName;
  args: Record<string, unknown>;
  status: "pending" | "running" | "approved" | "denied" | "done" | "error";
  output?: string;
  error?: string;
}

export interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number | null;
  modified: number | null;
}

/** Tools that mutate the filesystem and therefore need user approval. */
const DESTRUCTIVE: ToolName[] = [
  "write_file",
  "append_file",
  "replace_in_file",
  "delete_file",
  "delete_dir",
  "create_dir",
  "rename",
];

export function isDestructive(name: ToolName): boolean {
  return DESTRUCTIVE.includes(name);
}

const TOOL_NAME_SET = new Set<string>([
  "read_file",
  "read_file_range",
  "write_file",
  "append_file",
  "replace_in_file",
  "delete_file",
  "delete_dir",
  "create_dir",
  "list_dir",
  "search_files",
  "rename",
]);

export function isToolName(name: string): name is ToolName {
  return TOOL_NAME_SET.has(name);
}

/** Resolve a model-supplied path against the open workspace root. */
export function resolveFsPath(input: string, workspaceRoot?: string | null): string {
  const p = String(input ?? "").trim();
  if (!p) return p;
  if (/^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("/") || p.startsWith("\\\\")) return p;
  if (!workspaceRoot) return p;
  const root = workspaceRoot.replace(/[\\/]+$/, "");
  const useWin = /\\/.test(root) || /^[a-zA-Z]:/.test(root);
  const sep = useWin ? "\\" : "/";
  const rel = p.replace(/^[\\/]+/, "").replace(/[\\/]+/g, sep);
  return `${root}${sep}${rel}`;
}

interface JsonSchema {
  type: "object";
  properties: Record<string, { type: string; description: string }>;
  required: string[];
}

const pathProp = { type: "string", description: "File or folder path. Absolute, or relative to the workspace root." };

export const TOOL_JSON_SCHEMAS: Record<ToolName, { description: string; parameters: JsonSchema }> = {
  read_file: {
    description: "Read the full contents of a text file.",
    parameters: { type: "object", properties: { path: pathProp }, required: ["path"] },
  },
  read_file_range: {
    description: "Read a line range from a text file. end_line=0 means until EOF.",
    parameters: {
      type: "object",
      properties: {
        path: pathProp,
        start_line: { type: "integer", description: "1-based start line." },
        end_line: { type: "integer", description: "1-based end line, or 0 for EOF." },
      },
      required: ["path"],
    },
  },
  write_file: {
    description: "Create or overwrite a file (creates parent folders).",
    parameters: {
      type: "object",
      properties: {
        path: pathProp,
        content: { type: "string", description: "Full file contents to write." },
      },
      required: ["path", "content"],
    },
  },
  append_file: {
    description: "Append text to a file, creating it if missing.",
    parameters: {
      type: "object",
      properties: {
        path: pathProp,
        content: { type: "string", description: "Text to append." },
      },
      required: ["path", "content"],
    },
  },
  replace_in_file: {
    description: "Replace the first exact occurrence of search with replace.",
    parameters: {
      type: "object",
      properties: {
        path: pathProp,
        search: { type: "string", description: "Exact text to find." },
        replace: { type: "string", description: "Replacement text." },
      },
      required: ["path", "search", "replace"],
    },
  },
  delete_file: {
    description: "Permanently delete a file.",
    parameters: { type: "object", properties: { path: pathProp }, required: ["path"] },
  },
  delete_dir: {
    description: "Recursively delete a folder.",
    parameters: { type: "object", properties: { path: pathProp }, required: ["path"] },
  },
  create_dir: {
    description: "Create a folder (and parents).",
    parameters: { type: "object", properties: { path: pathProp }, required: ["path"] },
  },
  list_dir: {
    description: "List files and folders in a directory.",
    parameters: { type: "object", properties: { path: pathProp }, required: ["path"] },
  },
  search_files: {
    description: "Recursively search for pattern in file paths, or file contents when content=true.",
    parameters: {
      type: "object",
      properties: {
        path: pathProp,
        pattern: { type: "string", description: "Case-insensitive substring to match." },
        content: { type: "boolean", description: "Search file contents instead of paths." },
      },
      required: ["path", "pattern"],
    },
  },
  rename: {
    description: "Rename or move a file or folder.",
    parameters: {
      type: "object",
      properties: {
        path: pathProp,
        new_path: { type: "string", description: "Destination path." },
      },
      required: ["path", "new_path"],
    },
  },
};

/** OpenAI / OpenRouter / Groq / Ollama / custom compatible tools array. */
export const OPENAI_TOOLS = (Object.keys(TOOL_JSON_SCHEMAS) as ToolName[]).map((name) => ({
  type: "function" as const,
  function: {
    name,
    description: TOOL_JSON_SCHEMAS[name].description,
    parameters: TOOL_JSON_SCHEMAS[name].parameters,
  },
}));

/** Anthropic `tools` array. */
export const ANTHROPIC_TOOLS = (Object.keys(TOOL_JSON_SCHEMAS) as ToolName[]).map((name) => ({
  name,
  description: TOOL_JSON_SCHEMAS[name].description,
  input_schema: TOOL_JSON_SCHEMAS[name].parameters,
}));

/** Gemini functionDeclarations. */
export const GEMINI_FUNCTION_DECLARATIONS = (Object.keys(TOOL_JSON_SCHEMAS) as ToolName[]).map((name) => ({
  name,
  description: TOOL_JSON_SCHEMAS[name].description,
  parameters: TOOL_JSON_SCHEMAS[name].parameters,
}));

export interface NativeToolAcc {
  id: string;
  name: string;
  arguments: string;
}

function parseArgBlob(raw: string): Record<string, unknown> {
  const t = raw.trim();
  if (!t) return {};
  try {
    const v = JSON.parse(t) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  return { _raw: t };
}

export function nativeAccToCalls(acc: NativeToolAcc[]): ToolCall[] {
  return acc
    .filter((a) => a.name)
    .map((a) => ({
      id: a.id || undefined,
      name: a.name as ToolName,
      arguments: parseArgBlob(a.arguments),
    }));
}

/** Fold a provider stream/response chunk into accumulated native tool calls. */
export function ingestNativeChunk(json: unknown, acc: NativeToolAcc[]): void {
  if (!json || typeof json !== "object") return;
  const j = json as Record<string, unknown>;

  const ingestList = (list: unknown, indexed: boolean) => {
    if (!Array.isArray(list)) return;
    for (let i = 0; i < list.length; i++) {
      const tc = list[i] as Record<string, unknown>;
      if (!tc || typeof tc !== "object") continue;
      const idx = indexed && typeof tc.index === "number" ? tc.index : acc.length > 0 && !tc.id ? acc.length - 1 : acc.length;
      while (acc.length <= idx) acc.push({ id: "", name: "", arguments: "" });
      if (typeof tc.id === "string" && tc.id) acc[idx].id = tc.id;
      const fn = (tc.function as Record<string, unknown> | undefined) ?? tc;
      if (typeof fn.name === "string" && fn.name) acc[idx].name = fn.name;
      const args = fn.arguments ?? fn.args ?? fn.input;
      if (typeof args === "string") acc[idx].arguments += args;
      else if (args && typeof args === "object") acc[idx].arguments = JSON.stringify(args);
    }
  };

  const choices = j.choices as Array<Record<string, unknown>> | undefined;
  const choice = choices?.[0];
  const delta = choice?.delta as Record<string, unknown> | undefined;
  const msg = (choice?.message ?? j.message) as Record<string, unknown> | undefined;
  ingestList(delta?.tool_calls, true);
  ingestList(msg?.tool_calls, false);

  if (j.type === "content_block_start") {
    const cb = j.content_block as Record<string, unknown> | undefined;
    if (cb?.type === "tool_use") {
      const input = cb.input && typeof cb.input === "object" ? JSON.stringify(cb.input) : "";
      acc.push({
        id: typeof cb.id === "string" ? cb.id : `ant_${acc.length}`,
        name: typeof cb.name === "string" ? cb.name : "",
        arguments: input,
      });
    }
  }
  if (j.type === "content_block_delta") {
    const d = j.delta as Record<string, unknown> | undefined;
    if (d?.type === "input_json_delta" && acc.length > 0) {
      acc[acc.length - 1].arguments += String(d.partial_json ?? "");
    }
  }

  const parts =
    (j.candidates as Array<{ content?: { parts?: Array<Record<string, unknown>> } }> | undefined)?.[0]
      ?.content?.parts ?? [];
  for (const p of parts) {
    const fc = p?.functionCall as Record<string, unknown> | undefined;
    if (fc && typeof fc.name === "string") {
      acc.push({
        id: `gem_${acc.length}`,
        name: fc.name,
        arguments: JSON.stringify(fc.args ?? fc.arguments ?? {}),
      });
    }
  }
}

export function agenticSystemPrompt(workspaceRoot?: string | null): string {
  const ws = workspaceRoot
    ? `Workspace root: ${workspaceRoot}\nPrefer paths relative to this root. Absolute paths also work.\n`
    : "If the user has not opened a folder, ask for a path or use absolute paths.\n";
  return `${AGENTIC_PROMPT}\n\n${ws}`;
}

function inTauri(): boolean {
  const win = window as unknown as { __TAURI_INTERNALS__?: unknown };
  return !!win.__TAURI_INTERNALS__;
}

/** Browser fallback for non-Tauri (dev in plain browser) — read-only ops only. */
async function browserFallback(name: ToolName, args: Record<string, unknown>): Promise<ToolResult> {
  switch (name) {
    case "list_dir": {
      // Can't list a real directory in the browser; return a helpful message.
      return { ok: true, output: "Directory listing is only available in the desktop app (Tauri)." };
    }
    case "read_file": {
      const path = String(args.path ?? "");
      try {
        const res = await fetch(path);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { ok: true, output: await res.text() };
      } catch (e) {
        return { ok: false, output: `Failed to read ${path}: ${e instanceof Error ? e.message : String(e)}` };
      }
    }
    default:
      return {
        ok: false,
        output: `Tool "${name}" is only available in the desktop app (Tauri).`,
      };
  }
}

/**
 * Execute a single tool call. Returns a ToolResult that is fed back to the
 * model as a `<tool_result>` block.
 */
export async function executeTool(
  name: ToolName,
  args: Record<string, unknown>,
  workspaceRoot?: string | null
): Promise<ToolResult> {
  const resolved: Record<string, unknown> = { ...args };
  if (typeof resolved.path === "string") {
    resolved.path = resolveFsPath(resolved.path, workspaceRoot);
  }
  if (typeof resolved.new_path === "string") {
    resolved.new_path = resolveFsPath(resolved.new_path, workspaceRoot);
  }
  args = resolved;
  if (!inTauri()) {
    return browserFallback(name, args);
  }
  try {
    switch (name) {
      case "read_file":
        return { ok: true, output: await invoke<string>("fs_read_file", { path: String(args.path ?? "") }) };
      case "read_file_range":
        return {
          ok: true,
          output: await invoke<string>("fs_read_file_range", {
            path: String(args.path ?? ""),
            startLine: Number(args.start_line ?? 1),
            endLine: Number(args.end_line ?? 0),
          }),
        };
      case "write_file":
        await invoke("fs_write_file", {
          path: String(args.path ?? ""),
          content: String(args.content ?? ""),
        });
        return { ok: true, output: `Wrote ${String(args.path)} (${String(args.content ?? "").length} chars).` };
      case "append_file":
        await invoke("fs_append_file", {
          path: String(args.path ?? ""),
          content: String(args.content ?? ""),
        });
        return { ok: true, output: `Appended ${String(args.content ?? "").length} chars to ${String(args.path)}.` };
      case "replace_in_file":
        await invoke("fs_replace_in_file", {
          path: String(args.path ?? ""),
          search: String(args.search ?? ""),
          replace: String(args.replace ?? ""),
        });
        return { ok: true, output: `Replaced text in ${String(args.path)}.` };
      case "delete_file":
        await invoke("fs_delete_file", { path: String(args.path ?? "") });
        return { ok: true, output: `Deleted file ${String(args.path)}.` };
      case "delete_dir":
        await invoke("fs_delete_dir", { path: String(args.path ?? "") });
        return { ok: true, output: `Deleted directory ${String(args.path)}.` };
      case "create_dir":
        await invoke("fs_create_dir", { path: String(args.path ?? "") });
        return { ok: true, output: `Created directory ${String(args.path)}.` };
      case "list_dir": {
        const entries = await invoke<FsEntry[]>("fs_list_dir", { path: String(args.path ?? "") });
        const lines = entries.map((e) => {
          const kind = e.is_dir ? "dir " : "file";
          const size = e.size != null ? ` (${e.size} bytes)` : "";
          return `${kind}  ${e.name}${size}`;
        });
        return {
          ok: true,
          output: lines.length > 0 ? lines.join("\n") : "(empty directory)",
        };
      }
      case "search_files": {
        const hits = await invoke<string[]>("fs_search_files", {
          path: String(args.path ?? ""),
          pattern: String(args.pattern ?? ""),
          content: Boolean(args.content ?? false),
        });
        return {
          ok: true,
          output: hits.length > 0 ? hits.join("\n") : "No matches found.",
        };
      }
      case "rename":
        await invoke("fs_rename", {
          path: String(args.path ?? ""),
          newPath: String(args.new_path ?? ""),
        });
        return { ok: true, output: `Renamed ${String(args.path)} -> ${String(args.new_path)}.` };
      default:
        return { ok: false, output: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return {
      ok: false,
      output: e instanceof Error ? e.message : String(e),
    };
  }
}

function coerceArgs(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "string") return parseArgBlob(raw);
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

function pushNamedCall(calls: ToolCall[], name: unknown, args: unknown): void {
  if (typeof name !== "string" || !name) return;
  calls.push({ name: name as ToolName, arguments: coerceArgs(args) });
}

function tryParseJsonCall(blob: string, calls: ToolCall[]): boolean {
  try {
    const parsed = JSON.parse(blob) as {
      name?: string;
      tool?: string;
      arguments?: unknown;
      parameters?: unknown;
      args?: unknown;
    };
    const name = parsed.name ?? parsed.tool;
    if (typeof name === "string") {
      pushNamedCall(calls, name, parsed.arguments ?? parsed.parameters ?? parsed.args ?? {});
      return true;
    }
  } catch {
    /* not json */
  }
  return false;
}

/**
 * Parse text tool calls from many model families (XML, Hermes, Qwen, markdown JSON).
 */
export function parseToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const re = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;
  let m: RegExpExecArray | null;
  let xmlBlocks = 0;
  let jsonOk = 0;
  let jsonFail = 0;
  while ((m = re.exec(text)) !== null) {
    xmlBlocks++;
    const inner = m[1].trim();
    if (tryParseJsonCall(inner, calls)) {
      jsonOk++;
      continue;
    }
    const fn = inner.match(/<function=([^>\s]+)>[\s\S]*?<\/function>/i) ?? inner.match(/^([a-zA-Z0-9_]+)\s*\n/);
    if (fn) {
      const name = fn[1];
      const argObj: Record<string, unknown> = {};
      const argRe = /<parameter=([^>]+)>\s*([\s\S]*?)\s*<\/parameter>/gi;
      let am: RegExpExecArray | null;
      while ((am = argRe.exec(inner)) !== null) argObj[am[1]] = am[2];
      if (Object.keys(argObj).length === 0) {
        tryParseJsonCall(inner.replace(/^[^\n]+\n/, ""), calls);
      } else {
        pushNamedCall(calls, name, argObj);
      }
      jsonOk++;
    } else {
      jsonFail++;
    }
  }

  const invokeRe = /<invoke\s+name="([^"]+)">([\s\S]*?)<\/invoke>/gi;
  while ((m = invokeRe.exec(text)) !== null) {
    const argObj: Record<string, unknown> = {};
    const argRe = /<parameter\s+name="([^"]+)">([\s\S]*?)<\/parameter>/gi;
    let am: RegExpExecArray | null;
    while ((am = argRe.exec(m[2])) !== null) argObj[am[1]] = am[2];
    pushNamedCall(calls, m[1], argObj);
  }

  const hermesRe = /<function=([^>\s]+)>([\s\S]*?)<\/function>/gi;
  while ((m = hermesRe.exec(text)) !== null) {
    if (!tryParseJsonCall(m[2], calls)) {
      const argObj: Record<string, unknown> = {};
      const argRe = /<parameter=([^>]+)>\s*([\s\S]*?)\s*<\/parameter>/gi;
      let am: RegExpExecArray | null;
      while ((am = argRe.exec(m[2])) !== null) argObj[am[1]] = am[2];
      pushNamedCall(calls, m[1], argObj);
    }
  }

  const fenceRe = /```(?:json|tool_call|tool)?\s*([\s\S]*?)```/gi;
  while ((m = fenceRe.exec(text)) !== null) {
    tryParseJsonCall(m[1].trim(), calls);
  }

  // #region agent log
  debugLog("B", "agentic.ts:parseToolCalls", "parseToolCalls result", {
    xmlBlocks,
    jsonOk,
    jsonFail,
    callsFound: calls.length,
    callNames: calls.map((c) => c.name),
    textLen: text.length,
  });
  // #endregion
  return calls;
}

/** Strip tool-call markup from a response so the visible answer is clean. */
export function stripToolCalls(text: string): string {
  return text
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
    .replace(/<function=[^>]+>[\s\S]*?<\/function>/gi, "")
    .replace(/<invoke[\s\S]*?<\/invoke>/gi, "")
    .trim();
}

/** Build a `<tool_result>` block to feed back to the model. */
export function formatToolResult(result: ToolResult): string {
  const status = result.ok ? "success" : "error";
  return `<tool_result status="${status}">\n${result.output}\n</tool_result>`;
}

/** Human-readable label for each tool. */
export const TOOL_LABELS: Record<ToolName, string> = {
  read_file: "Read file",
  read_file_range: "Read file range",
  write_file: "Write file",
  append_file: "Append to file",
  replace_in_file: "Replace in file",
  delete_file: "Delete file",
  delete_dir: "Delete folder",
  create_dir: "Create folder",
  list_dir: "List folder",
  search_files: "Search files",
  rename: "Rename / move",
};

/** Short description of each tool for the model's system prompt. */
export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  read_file: 'read_file(path) — read the full contents of a text file.',
  read_file_range: 'read_file_range(path, start_line, end_line) — read a line range (end_line=0 means to EOF).',
  write_file: 'write_file(path, content) — create or overwrite a file (creates parent folders).',
  append_file: 'append_file(path, content) — append text to a file, creating it if missing.',
  replace_in_file: 'replace_in_file(path, search, replace) — replace the first exact occurrence of search with replace.',
  delete_file: 'delete_file(path) — permanently delete a file.',
  delete_dir: 'delete_dir(path) — recursively delete a folder.',
  create_dir: 'create_dir(path) — create a folder (and parents).',
  list_dir: 'list_dir(path) — list files and folders in a directory.',
  search_files: 'search_files(path, pattern, content=false) — recursively search for pattern in file paths (or file contents when content=true).',
  rename: 'rename(path, new_path) — rename or move a file/folder.',
};

/** The protocol instructions injected into the system prompt. */
export const AGENTIC_PROMPT = `
You have access to filesystem tools. When the user asks you to read, create,
edit, delete, search, or manage files and folders, use the tools below.

Available tools:
${Object.values(TOOL_DESCRIPTIONS).map((d) => `- ${d}`).join("\n")}

Prefer the native tool/function-calling API when it is available.

If you can only emit text, use exactly one JSON block:

<tool_call>
{"name": "read_file", "arguments": {"path": "src/main.ts"}}
</tool_call>

Rules:
1. Call at most ONE tool per message. Wait for the tool result before the next call.
2. After a tool result, continue working: read more, edit, search, etc., one tool at a time.
3. When you have everything you need, reply with your final answer in plain text (no tool_call blocks).
4. Destructive tools (write_file, append_file, replace_in_file, delete_file, delete_dir, create_dir, rename) require user approval — the app will ask the user before executing them. If the user denies, you will receive an error result; adapt accordingly.
5. Paths may be absolute or relative to the workspace root.
6. Keep file contents you write complete and correct — do not truncate.
7. If a tool errors, read the error and try a different approach.
`.trim();

/** Generate a unique activity id. */
export function activityId(): string {
  return `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}