import { useCallback, useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FsEntry } from "../agentic";
import { FileIcon } from "./FileIcon";

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

/* --- Chrome icons -------------------------------------------------------- */

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-3 w-3 shrink-0 text-[#6b6b6b] transition-transform duration-150 ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-4 w-4 shrink-0 transition-colors duration-150 ${open ? "text-zinc-300" : "text-zinc-500 group-hover:text-zinc-400"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {open ? (
        <>
          <path d="M1.5 12.5V3.75A.75.75 0 0 1 2.25 3h3l1.5 1.75h5.25a.75.75 0 0 1 .75.75V7" />
          <path d="M1.5 12.5l1.9-4.55a.75.75 0 0 1 .69-.45h9.36a.5.5 0 0 1 .46.7L12.2 12.5H1.5z" />
        </>
      ) : (
        <path d="M1.75 13V3.75A.75.75 0 0 1 2.5 3h3l1.5 1.75h6a.75.75 0 0 1 .75.75V13a.75.75 0 0 1-.75.75h-10.5A.75.75 0 0 1 1.75 13z" />
      )}
    </svg>
  );
}

/* ===========================================================================
 * Component
 * ======================================================================== */

export default function FileExplorer({ root, activePath, refreshKey, onOpenFile }: FileExplorerProps) {
  const [nodes, setNodes] = useState<Record<string, NodeState>>({});
  const [query, setQuery] = useState("");

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
    if (cur?.open && !query) {
      setNodes((prev) => ({ ...prev, [entry.path]: { ...prev[entry.path], open: false } }));
      return;
    }
    void loadDir(entry.path);
  };

  const sortEntries = (list: FsEntry[]) =>
    [...list].sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

  /** True when an entry (or any loaded descendant) matches the filter. */
  const matches = useCallback(
    (entry: FsEntry): boolean => {
      if (!query) return true;
      const q = query.toLowerCase();
      if (entry.name.toLowerCase().includes(q)) return true;
      if (!entry.is_dir) return false;
      const kids = nodes[entry.path]?.entries ?? [];
      return kids.some(matches);
    },
    [query, nodes]
  );

  const collapseAll = () => {
    setNodes((prev) => {
      const next: Record<string, NodeState> = {};
      for (const [k, v] of Object.entries(prev)) next[k] = { ...v, open: k === root };
      return next;
    });
  };

  /**
   * Render the tree as a flat list of rows with depth-based indentation
   * (VS Code style) instead of nested containers.
   */
  const renderTree = (path: string, depth: number): ReactNode[] => {
    const raw = path === root ? nodes[root]?.entries ?? [] : nodes[path]?.entries ?? [];
    const list = sortEntries(raw).filter(matches);

    return list.flatMap((e) => {
      const isOpen = !!nodes[e.path]?.open;
      const active = activePath === e.path;
      const row = (
        <button
          key={e.path}
          type="button"
          onClick={() => toggle(e)}
          className={`group relative flex h-6 w-full items-center gap-1.5 rounded-[4px] pr-2 text-left text-[12px] leading-none transition-colors duration-100 ${
            active
              ? "bg-white/[0.08] text-[#ececec]"
              : e.is_dir
                ? "text-[#c9c9c9] hover:bg-white/[0.05]"
                : "text-[#a3a3a3] hover:bg-white/[0.05] hover:text-[#d4d4d4]"
          }`}
          style={{ paddingLeft: 8 + depth * 14 }}
          title={e.path}
        >
          {active && (
            <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-[#4c8dff]" />
          )}
          <span className="flex w-3.5 shrink-0 items-center justify-center">
            {e.is_dir && <ChevronIcon open={isOpen} />}
          </span>
          {e.is_dir ? <FolderIcon open={isOpen} /> : <FileIcon name={e.name} />}
          <span className={`truncate ${active ? "font-medium" : ""}`}>{e.name}</span>
        </button>
      );

      // Children render directly below the parent (flat list, indented).
      const kids = e.is_dir && isOpen ? renderTree(e.path, depth + 1) : [];
      return [row, ...kids];
    });
  };

  /** Count every visible (loaded + filtered) entry, for the footer. */
  const countVisible = (path: string): number => {
    const raw = path === root ? nodes[root]?.entries ?? [] : nodes[path]?.entries ?? [];
    const list = sortEntries(raw).filter(matches);
    return list.reduce(
      (acc, e) =>
        acc + (e.is_dir && nodes[e.path]?.open ? countVisible(e.path) : 0) + 1,
      0
    );
  };

  const name = root.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? root;
  const tree = renderTree(root, 0);
  const itemCount = countVisible(root);

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-white/[0.07] bg-[#131313]">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-white/[0.07]">
        <div className="flex items-center justify-between px-3 pb-1 pt-2.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#6b6b6b]">
            Explorer
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={collapseAll}
              title="Collapse folders"
              className="flex h-6 w-6 items-center justify-center rounded-md text-[#6b6b6b] transition hover:bg-white/[0.06] hover:text-[#d4d4d4]"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h10M5.5 3.5L3 6l2.5 2.5M13 10H3M10.5 7.5L13 10l-2.5 2.5" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => void loadDir(root)}
              title="Refresh"
              className="flex h-6 w-6 items-center justify-center rounded-md text-[#6b6b6b] transition hover:bg-white/[0.06] hover:text-[#d4d4d4]"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v2.6h-2.6" />
              </svg>
            </button>
          </div>
        </div>

        {/* Workspace name */}
        <div className="flex items-center gap-1.5 px-3 pb-2">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-[#a3a3a3]" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1.75 13V3.75A.75.75 0 0 1 2.5 3h3l1.5 1.75h6a.75.75 0 0 1 .75.75V13a.75.75 0 0 1-.75.75h-10.5A.75.75 0 0 1 1.75 13z" />
          </svg>
          <span className="truncate text-[12px] font-medium text-[#d4d4d4]" title={root}>
            {name}
          </span>
        </div>

        {/* Filter box */}
        <div className="relative px-2.5 pb-2.5">
          <svg
            viewBox="0 0 16 16"
            className="pointer-events-none absolute left-[18px] top-1/2 h-3 w-3 -translate-y-1/2 text-[#555555]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <circle cx="7" cy="7" r="4.4" />
            <path d="M10.4 10.4L13.5 13.5" />
          </svg>
          <input
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            placeholder="Filter files…"
            spellCheck={false}
            className="w-full rounded-md border border-white/[0.08] bg-black/30 py-1.5 pl-7 pr-2.5 text-[11.5px] text-[#d4d4d4] placeholder-[#555555] outline-none transition focus:border-white/[0.18]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              title="Clear filter"
              className="absolute right-[18px] top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded text-[#6b6b6b] transition hover:text-[#d4d4d4]"
            >
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Tree ───────────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        {tree.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-4 py-10 text-center">
            <svg viewBox="0 0 16 16" className="h-6 w-6 text-[#4a4a4a]" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1.75 13V3.75A.75.75 0 0 1 2.5 3h3l1.5 1.75h6a.75.75 0 0 1 .75.75V13a.75.75 0 0 1-.75.75h-10.5A.75.75 0 0 1 1.75 13z" />
            </svg>
            <p className="text-[11px] leading-5 text-[#6b6b6b]">
              {query ? `No files match "${query}"` : "This folder is empty."}
            </p>
          </div>
        ) : (
          tree
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="flex h-6 shrink-0 items-center justify-between border-t border-white/[0.07] px-3 text-[10px] text-[#555555]">
        <span>{itemCount} item{itemCount === 1 ? "" : "s"}</span>
        {query && <span className="truncate">filtered</span>}
      </div>
    </aside>
  );
}
