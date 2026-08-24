
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
  | "rename"
  | "run_command";

export interface ToolCall {
  id?: string;
  /** Known tool name, or a dynamic name such as `mcp_<server>_<tool>`. */
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  ok: boolean;
  output: string;
}

export interface AgenticActivity {
  id: string;
  /** Known tool name or a dynamic `mcp_<server>_<tool>` name. */
  tool: string;
  args: Record<string, unknown>;
  status: "pending" | "running" | "approved" | "denied" | "done" | "error";
  output?: string;
  error?: string;
  /** Line diff (old → new) attached after a successful file mutation. */
  diff?: Array<{ type: "add" | "del" | "ctx"; text: string }>;
}

export interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number | null;
  modified: number | null;
}

/** Tools that mutate the filesystem / execute code and need user approval. */
const DESTRUCTIVE: ToolName[] = [
  "write_file",
  "append_file",
  "replace_in_file",
  "delete_file",
  "delete_dir",
  "create_dir",
  "rename",
  "run_command",
];

export function isDestructive(name: string): boolean {
  return (DESTRUCTIVE as string[]).includes(name);
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
  "run_command",
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
  run_command: {
    description:
      "Run a shell command (builds, tests, git, package managers…) and capture stdout/stderr.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to run." },
        cwd: { type: "string", description: "Working directory. Defaults to the workspace root." },
        timeout_secs: { type: "integer", description: "Timeout in seconds (1-300, default 60)." },
      },
      required: ["command"],
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
async function browserFallback(name: string, args: Record<string, unknown>): Promise<ToolResult> {
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
  name: string,
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
      case "read_file": {
        const content = await invoke<string>("fs_read_file", { path: String(args.path ?? "") });
        // Smart truncation: keep the model oriented by reporting the file's
        // size and pointing at read_file_range instead of dumping everything.
        const MAX_READ = 12000;
        if (content.length <= MAX_READ) return { ok: true, output: content };
        const NL_CH = String.fromCharCode(10);
        const totalLines = content.split(NL_CH).length;
        const head = Math.floor(MAX_READ * 0.7);
        const tail = MAX_READ - head;
        const headLine = content.slice(0, head).split(NL_CH).length;
        const tailStartLine = content.slice(0, content.length - tail).split(NL_CH).length;
        return {
          ok: true,
          output:
            `[Truncated preview — file has ${totalLines} lines / ${content.length} chars.` +
            ` Use read_file_range(start_line=${headLine + 1}, end_line=${tailStartLine - 1}) for the middle section.]` +
            `${NL_CH}${content.slice(0, head)}${NL_CH}… [${content.length - head - tail} chars omitted] …${NL_CH}` +
            content.slice(content.length - tail),
        };
      }
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
      case "run_command": {
        const cwdArg = typeof args.cwd === "string" && args.cwd.trim() ? args.cwd.trim() : null;
        const res = await invoke<Record<string, unknown>>("run_command", {
          command: String(args.command ?? ""),
          cwd: cwdArg ? resolveFsPath(cwdArg, workspaceRoot) : null,
          timeoutSecs: typeof args.timeout_secs === "number" ? Math.round(args.timeout_secs) : null,
        });
        const timedOut = Boolean(res.timedOut);
        const exitCode = res.exitCode as number | null;
        const stdout = String(res.stdout ?? "").trim();
        const stderr = String(res.stderr ?? "").trim();
        const NL_CH2 = String.fromCharCode(10);
        const parts: string[] = [];
        if (timedOut) parts.push("Command timed out and was killed.");
        else parts.push(`Exit code: ${exitCode}`);
        if (stdout) parts.push(`stdout:${NL_CH2}${stdout}`);
        if (stderr) parts.push(`stderr:${NL_CH2}${stderr}`);
        return { ok: !timedOut && exitCode === 0, output: parts.join(`${NL_CH2}${NL_CH2}`) };
      }
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
      // OpenAI-style nested shape some models emit in text:
      // { "type": "function", "function": { "name": ..., "arguments": {...} } }
      function?: { name?: string; arguments?: unknown };
      arguments?: unknown;
      parameters?: unknown;
      args?: unknown;
    };

    // Nested OpenAI-style shape first.
    if (parsed.function && typeof parsed.function.name === "string") {
      pushNamedCall(calls, parsed.function.name, parsed.function.arguments ?? {});
      return true;
    }

    // Wrapper shape some models emit: {"tool_calls": [{name, arguments}, …]}
    if (Array.isArray((parsed as Record<string, unknown>).tool_calls)) {
      let ok = false;
      for (const item of (parsed as Record<string, unknown>).tool_calls as unknown[]) {
        if (tryParseJsonCall(JSON.stringify(item), calls)) ok = true;
      }
      if (ok) return true;
    }

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

/** Parse a blob that may be a single call or a JSON array of calls. */
function tryParseJsonBlob(blob: string, calls: ToolCall[]): boolean {
  const t = blob.trim();
  if (t.startsWith("[")) {
    try {
      const arr = JSON.parse(t) as unknown[];
      let ok = false;
      for (const item of arr) {
        if (tryParseJsonCall(JSON.stringify(item), calls)) ok = true;
      }
      return ok;
    } catch {
      return false;
    }
  }
  return tryParseJsonCall(t, calls);
}

/** True when a JSON blob has both a name-ish key and an args-ish key. */
function looksLikeToolCallJson(blob: string): boolean {
  return (
    /"\s*(?:tool|name|function)"\s*:/.test(blob) &&
    /"\s*(?:arguments|parameters|args|input)"\s*:/.test(blob)
  );
}

/**
 * Extract bare JSON tool calls printed as plain text with no tags or fences,
 * e.g.  {"tool": "read_file", "arguments": {"path": "C:/x.py"}}
 * Scans balanced `{…}` regions and parses the ones that look like calls.
 */
export function extractBareJsonCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  for (let i = 0; i < text.length; i++) {
    const openCh = text[i];
    if (openCh !== "{" && openCh !== "[") continue;
    let depth = 0;
    let end = -1;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (ch === "{" || ch === "[") depth++;
      else if (ch === "}" || ch === "]") {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end === -1) break;
    const blob = text.slice(i, end + 1);
    if (looksLikeToolCallJson(blob)) {
      const before = calls.length;
      tryParseJsonBlob(blob, calls);
      if (calls.length > before) i = end; // skip past the consumed blob
    }
  }
  return calls;
}

/**
 * Hide an incomplete trailing bare-JSON tool call while streaming, e.g.
 * `…{"tool": "read_fi` — otherwise partial JSON flashes in the chat and
 * breaks the surrounding markdown until the blob completes.
 */
function stripTrailingPartialJson(text: string): string {
  const m = /\{[^{}]*$/.exec(text);
  if (!m) return text;
  // Match partial keys too ("tool", "nam", "argumen"…) since the stream
  // may be cut mid-key or mid-value.
  if (/"(?:tool|name|function|argumen|paramete|inpu)/.test(m[0])) {
    return text.slice(0, m.index);
  }
  return text;
}

/** Remove bare JSON tool-call blobs from visible output. */
function stripBareJsonCalls(text: string): string {
  // Cheap pre-check before running the O(n²) scanner.
  if (!/"\s*(?:tool|name|function)"\s*:/.test(text)) return text;
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "{") {
      let depth = 0;
      let end = -1;
      for (let j = i; j < text.length; j++) {
        const ch = text[j];
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) {
            end = j;
            break;
          }
        }
      }
      const blob = end !== -1 ? text.slice(i, end + 1) : "";
      if (blob && looksLikeToolCallJson(blob)) {
        const before: ToolCall[] = [];
        tryParseJsonBlob(blob, before);
        if (before.length > 0) {
          i = end + 1;
          continue; // drop the blob
        }
      }
    }
    out += text[i];
    i++;
  }
  return out;
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
    if (tryParseJsonBlob(inner, calls)) {
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
    tryParseJsonBlob(m[1].trim(), calls);
  }

  // Bare JSON objects printed as plain text (no tags/fences at all).
  calls.push(...extractBareJsonCalls(text));

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

/**
 * Strip tool-call markup from a response so the visible answer is clean.
 * Also removes *incomplete* trailing markup (e.g. `<tool_call>{"na`) so raw
 * tool JSON never flashes on screen while a response is streaming.
 */
export function stripToolCalls(text: string): string {
  const stripped = text
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
    .replace(/<tool_call>[^<]*$/i, "")
    .replace(/<function=[^>]+>[\s\S]*?<\/function>/gi, "")
    .replace(/<function=[^<]*$/i, "")
    .replace(/<invoke[\s\S]*?<\/invoke>/gi, "")
    .replace(/<invoke[^<]*$/i, "");
  return stripTrailingPartialJson(stripBareJsonCalls(stripped)).trim();
}

/**
 * Make partially-streamed markdown render sanely: if a tool call was
 * stripped from the middle of a fenced code block, the fence becomes
 * unbalanced and the whole message renders as a code wall. Appending a
 * closing fence while streaming keeps the layout stable until the real
 * content completes.
 */
export function stabilizeStreamingMarkdown(text: string): string {
  const fenceCount = (text.match(/```/g) ?? []).length;
  if (fenceCount % 2 === 1) return `${text}
\`\`\``;
  return text;
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
  run_command: "Run command",
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
  run_command: 'run_command(command, cwd?, timeout_secs?) — run a shell command (npm test, cargo build, git status…) and capture its output.',
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
1. Batch independent read-only calls (read_file, read_file_range, list_dir, search_files) together in ONE message — the app executes them in parallel, which is much faster.
2. Mutating tools (write_file, append_file, replace_in_file, delete_file, delete_dir, create_dir, rename, run_command) must be called ONE at a time; wait for each result before the next mutation.
3. Keep commentary between tool calls minimal (one short sentence at most). When you have everything you need, reply with your final answer in plain text (no tool_call blocks).
4. Destructive tools require user approval — the app will ask the user before executing them. If the user denies, you will receive an error result; adapt accordingly and do not retry the same call.
5. Paths may be absolute or relative to the workspace root.
6. Keep file contents you write complete and correct — never truncate or use placeholders.
7. If a tool errors, read the error and try a different approach.
8. After editing files, verify your work: use run_command to build/test/lint when a build system exists (e.g. "npm run build", "cargo check"). Read compile errors and fix them.
9. search_files with content=true returns matches as path:line: text — use those line numbers with read_file_range to inspect precisely.
`.trim();

/** Generate a unique activity id. */
export function activityId(): string {
  return `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}