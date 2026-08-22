import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FsEntry } from "../agentic";
import { LangBadge } from "./CodeEditor";

const SKIP = new Set([
  "node_modules",
  ".git",
  "target",
  "dist",
  ".next",
  "__pycache__",
  ".venv",
  "venv",
]);

interface FileExplorerProps {
  root: string;
  activePath: string | null;
  refreshKey: number;
  onOpenFile: (path: string) => void;
}

interface NodeState {
  entries?: FsEntry[];
  open?: boolean;
}

export default function FileExplorer({ root, activePath, refreshKey, onOpenFile }: FileExplorerProps) {
  const [nodes, setNodes] = useState<Record<string, NodeState>>({});

  const loadDir = useCallback(async (path: string) => {
    try {
      const entries = await invoke<FsEntry[]>("fs_list_dir", { path });
      const filtered = entries.filter((e) => !SKIP.has(e.name));
      setNodes((prev) => ({ ...prev, [path]: { ...prev[path], entries: filtered, open: true } }));
    } catch {
      setNodes((prev) => ({ ...prev, [path]: { entries: [], open: true } }));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const entries = await invoke<FsEntry[]>("fs_list_dir", { path: root });
        if (cancelled) return;
        const filtered = entries.filter((e) => !SKIP.has(e.name));
        setNodes((prev) => ({
          ...prev,
          [root]: { ...prev[root], entries: filtered, open: true },
        }));
      } catch {
        if (cancelled) return;
        setNodes((prev) => ({ ...prev, [root]: { entries: [], open: true } }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, refreshKey]);

  const toggle = (entry: FsEntry) => {
    if (!entry.is_dir) {
      onOpenFile(entry.path);
      return;
    }
    const cur = nodes[entry.path];
    if (cur?.open) {
      setNodes((prev) => ({ ...prev, [entry.path]: { ...prev[entry.path], open: false } }));
      return;
    }
    void loadDir(entry.path);
  };

  const renderList = (path: string, depth: number) => {
    const entries = nodes[path]?.entries ?? [];
    return entries.map((e) => {
      const isOpen = !!nodes[e.path]?.open;
      const active = activePath === e.path;
      return (
        <div key={e.path}>
          <button
            type="button"
            onClick={() => toggle(e)}
            className={`flex w-full items-center gap-1.5 truncate px-2 py-[3px] text-left text-[12px] ${
              active ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200"
            }`}
            style={{ paddingLeft: 8 + depth * 12 }}
            title={e.path}
          >
            <span className="flex w-3 shrink-0 items-center justify-center text-[10px] text-zinc-500">
              {e.is_dir ? (isOpen ? "▾" : ">") : null}
            </span>
            {!e.is_dir && <LangBadge path={e.path} />}
            <span className="truncate">{e.name}</span>
          </button>
          {e.is_dir && isOpen ? renderList(e.path, depth + 1) : null}
        </div>
      );
    });
  };

  const name = root.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? root;

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950/80">
      <div className="truncate border-b border-zinc-800 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {name}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">{renderList(root, 0)}</div>
    </aside>
  );
}
