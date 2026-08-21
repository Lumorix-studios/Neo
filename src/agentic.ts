/**
 * Agentic filesystem tools.
 *
 * The AI (local Ollama or any cloud provider) drives these tools through a
 * simple text protocol that works with every model:
 *
 *   <tool_call>
 *   {"name": "read_file", "arguments": {"path": "src/main.ts"}}
 *   </tool_call>
 *
 * The app executes the tool and feeds the result back as:
 *
 *   <tool_result>
 *   ...output...
 *   </tool_result>
 *
 * The conversation loops until the model produces a final answer without a
 * tool call. Destructive operations (write, delete, rename) require explicit
 * user approval before they are executed.
 */
import { invoke } from "@tauri-apps/api/core";

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
export async function executeTool(name: ToolName, args: Record<string, unknown>): Promise<ToolResult> {
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

/**
 * Parse a model response for `<tool_call>` blocks. Returns the list of calls
 * in the order they appear. Malformed blocks are ignored so the model can
 * still produce a plain answer.
 */
export function parseToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const re = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[1]) as { name?: string; arguments?: Record<string, unknown> };
      if (parsed.name && typeof parsed.name === "string") {
        calls.push({
          name: parsed.name as ToolName,
          arguments: parsed.arguments ?? {},
        });
      }
    } catch {
      // Malformed JSON — skip this block.
    }
  }
  return calls;
}

/** Strip `<tool_call>` blocks from a response so the visible answer is clean. */
export function stripToolCalls(text: string): string {
  return text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").trim();
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

How to call a tool — emit exactly one block per tool call, with valid JSON:

<tool_call>
{"name": "read_file", "arguments": {"path": "C:/path/to/file.txt"}}
</tool_call>

Rules:
1. Call at most ONE tool per message. Wait for the <tool_result> before the next call.
2. After a tool result, continue working: read more, edit, search, etc., one tool at a time.
3. When you have everything you need, reply with your final answer in plain text (no tool_call blocks).
4. Destructive tools (write_file, append_file, replace_in_file, delete_file, delete_dir, create_dir, rename) require user approval — the app will ask the user before executing them. If the user denies, you will receive an error result; adapt accordingly.
5. Use absolute paths. On Windows use backslashes or forward slashes (both work).
6. Keep file contents you write complete and correct — do not truncate.
7. If a tool errors, read the error and try a different approach.
`.trim();

/** Generate a unique activity id. */
export function activityId(): string {
  return `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}