import { memo, useCallback, useEffect, useState, type ReactNode } from "react";
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
  /** Hide the whole explorer panel (VS Code-style sidebar collapse). */
  onCollapse?: () => void;
  /** Sidebar width in px (drag-to-resize, owned by the parent window). */
  width?: number;
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


function FileExplorer({ root, activePath, refreshKey, onOpenFile, onCollapse, width }: FileExplorerProps) {
  const [nodes, setNodes] = useState<Record<string, NodeState>>({});
  const [query, setQuery] = useState("");
  // Inline "new file / new folder" entry input.
  const [creating, setCreating] = useState<{ parent: string; kind: "file" | "folder" } | null>(null);
  const [newName, setNewName] = useState("");
  // Right-click context menu position + target.
  const [menu, setMenu] = useState<{ x: number; y: number; entry: FsEntry } | null>(null);
  // Header "+" dropdown toggle.
  const [newMenu, setNewMenu] = useState(false);
  // Inline rename state.
  const [renaming, setRenaming] = useState<{ path: string; parent: string } | null>(null);
  const [renameInput, setRenameInput] = useState("");
  // Surfaced operation errors (create / rename / delete).
  const [createError, setCreateError] = useState<string | null>(null);

  /** Absolute path to a child of `dir`. Nested "a/b/c.ts" paths are kept so
   *  the backend's create_dir_all() makes intermediate folders automatically. */
  const childOf = (dir: string, name: string) => {
    const rel = name.trim().replace(/^[\\/]+/, "").replace(/\\/g, "/");
    return `${dir.replace(/[\\/]+$/, "")}/${rel}`;
  };

  /** Refresh a directory's listing in the tree. */
  const reloadDir = async (dir: string) => {
    try {
      const entries = await invoke<FsEntry[]>("fs_list_dir", { path: dir });
      setNodes((prev) => ({
        ...prev,
        [dir]: { ...prev[dir], entries: entries.filter((e) => !SKIP.has(e.name)), open: true },
      }));
    } catch {
      /* ignore transient listing errors */
    }
  };

  /** Create a file or folder, then refresh the parent and open files. */
  const createEntry = async () => {
    if (!creating) return;
    const name = newName.trim();
    if (!name) {
      // Cancelled — no error, just close the row.
      setCreating(null);
      setNewName("");
      return;
    }
    const apiName = childOf(creating.parent, name);
    try {
      if (creating.kind === "folder") {
        await invoke("fs_create_dir", { path: apiName });
      } else {
        await invoke("fs_write_file", { path: apiName, content: "" });
      }
      await reloadDir(creating.parent);
      if (creating.kind === "file") onOpenFile(apiName);
    } catch (e) {
      // Surface creation failures without losing the typed name.
      setCreateError(e instanceof Error ? e.message : String(e));
      return;
    }
    setCreating(null);
    setNewName("");
    setCreateError(null);
  };

  /** Rename an existing entry. */
  const commitRename = async () => {
    if (!renaming) return;
    const newName2 = renameInput.trim();
    if (newName2) {
      try {
        await invoke("fs_rename", {
          path: renaming.path,
          new_path: childOf(renaming.parent, newName2),
        });
        await reloadDir(renaming.parent);
      } catch (e) {
        setCreateError(e instanceof Error ? e.message : String(e));
        return;
      }
    }
    setRenaming(null);
    setRenameInput("");
    setCreateError(null);
  };


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

  /** Delete a file or folder (with confirmation), then refresh its parent. */
  const deleteEntry = async (entry: FsEntry) => {
    setMenu(null);
    if (!window.confirm(`Delete "${entry.name}"? This cannot be undone.`)) return;
    const dirSegs = entry.path.replace(/[\\/]+$/, "").split(/[\\/]/);
    dirSegs.pop();
    const parent = dirSegs.join("/");
    try {
      await invoke(entry.is_dir ? "fs_delete_dir" : "fs_delete_file", { path: entry.path });
      await reloadDir(parent);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    }
  };

  const sortEntries = (list: FsEntry[]) =>
    [...list].sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

  /** Inline "new file / new folder" naming row rendered at a given depth. */
  const renderCreateRow = (depth: number): ReactNode => (
    <div
      key="__new__"
      className="mb-0.5 flex h-6 items-center gap-1.5"
      style={{ paddingLeft: 8 + depth * 14 }}
    >
      {creating?.kind === "folder" ? (
        <FolderIcon open={false} />
      ) : (
        <FileIcon name={newName.trim() || "file.txt"} />
      )}
      <input
        autoFocus
        value={newName}
        onChange={(ev) => setNewName(ev.target.value)}
        onKeyDown={(ev) => {
          if (ev.key === "Enter") void createEntry();
          if (ev.key === "Escape") {
            setCreating(null);
            setNewName("");
          }
        }}
        onBlur={() => void createEntry()}
        placeholder={creating?.kind === "folder" ? "folder name…" : "file name.ts…"}
        spellCheck={false}
        className="min-w-0 flex-1 rounded border border-(--accent) bg-black/40 px-1 py-px text-[12px] text-[#ececec] outline-none placeholder-[#555555]"
      />
    </div>
  );

  /** True when an entry (or any loaded descendant) matches the filter. */
  function matches(entry: FsEntry): boolean {
    if (!query) return true;
    const q = query.toLowerCase();
    if (entry.name.toLowerCase().includes(q)) return true;
    if (!entry.is_dir) return false;
    const kids = nodes[entry.path]?.entries ?? [];
    return kids.some(matches);
  }

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
      const isRenaming = renaming?.path === e.path;
      const row = (
        <div
          key={e.path}
          onContextMenu={(ev) => {
            ev.preventDefault();
            setMenu({ x: ev.clientX, y: ev.clientY, entry: e });
          }}
          className="group relative"
        >
          <button
            type="button"
            onClick={() => toggle(e)}
            className={`relative flex h-[22px] w-full items-center gap-1.5 rounded-[5px] pr-2 text-left text-[13px] leading-none transition-colors duration-100 ${
              active
                ? "bg-white/[0.09] text-[#e8e8e8]"
                : e.is_dir
                  ? "text-[#c9c9c9] hover:bg-white/[0.05]"
                  : "text-[#c9c9c9] hover:bg-white/[0.05] hover:text-[#e8e8e8]"
            }`}
            style={{ paddingLeft: 8 + depth * 14 }}
            title={e.path}
          >
            <span className="flex w-3.5 shrink-0 items-center justify-center">
              {e.is_dir && <ChevronIcon open={isOpen} />}
            </span>
            {e.is_dir ? <FolderIcon open={isOpen} /> : <FileIcon name={e.name} />}
            {isRenaming ? (
              <input
                autoFocus
                value={renameInput}
                onChange={(ev) => setRenameInput(ev.target.value)}
                onClick={(ev) => ev.stopPropagation()}
                onKeyDown={(ev) => {
                  ev.stopPropagation();
                  if (ev.key === "Enter") void commitRename();
                  if (ev.key === "Escape") {
                    setRenaming(null);
                    setRenameInput("");
                  }
                }}
                onBlur={() => void commitRename()}
                className="min-w-0 flex-1 rounded border border-(--accent) bg-black/40 px-1 py-px text-[12px] text-[#ececec] outline-none"
              />
            ) : (
              <span className={`truncate ${active ? "font-medium" : ""}`}>
                {e.name}
              </span>
            )}
          </button>
        </div>
      );

      // Children render directly below the parent (flat list, indented).
      const kids = e.is_dir && isOpen ? renderTree(e.path, depth + 1) : [];
      const out = [row, ...kids];
      // New-item input appears inside the folder you right-clicked.
      if (e.is_dir && creating?.parent === e.path) out.push(renderCreateRow(depth + 1));
      return out;
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
  // Header "+" creates at the workspace root — its input row sits at depth 0.
  const tree =
    creating?.parent === root
      ? [...renderTree(root, 0), renderCreateRow(0)]
      : renderTree(root, 0);
  const itemCount = countVisible(root);

  return (
    <aside
      className="flex h-full shrink-0 flex-col border-white/[0.07] bg-[var(--bg-chrome)]"
      style={{ width: width ?? 240 }}
    >
      {/* -- Header ------------------------------------------------------- */}
      <div className="shrink-0 border-b border-white/[0.02]">
        {/* VS Code shows the view name above the workspace section. */}
        <div className="flex h-[5px] items-center pl-4 pr-2 pt-1">
        </div>
        <div className="flex items-center justify-between pb-1 pl-4 pr-2">
          <span
            className="min-w-0 truncate text-[8px] font-bold uppercase tracking-[0.08em] text-[#cccccc]"
            title={root}
          >
            {name}
          </span>
          <div className="flex items-center gap-0.2">
            <button
              type="button"
              onClick={onCollapse}
              title="Collapse explorer panel"
              aria-label="Collapse explorer panel"
              className="flex h-6 w-6 items-center justify-center rounded-md text-[#6b6b6b] transition hover:bg-white/[0.06] hover:text-[#d4d4d4]"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 4L2.5 8 6 12M9.5 4L6 8l3.5 4" />
              </svg>
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setNewMenu((v) => !v)}
                title="New file or folder"
                aria-label="New file or folder"
                className="flex h-6 w-6 items-center justify-center rounded-md text-[#6b6b6b] transition hover:bg-white/[0.06] hover:text-[#d4d4d4]"
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M8 3v10M3 8h10" />
                </svg>
              </button>
              {newMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNewMenu(false)} />
                  <div className="absolute left-full top-0 z-50 ml-1 w-40 overflow-hidden rounded-lg border-white/[0.00] bg-[var(--bg-elevated)] py-1 shadow-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setNewMenu(false);
                        setCreating({ parent: root, kind: "file" });
                        setNewName("");
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[#d4d4d4] transition hover:bg-white/[0.06]"
                    >
                      <FileIcon name="" />
                      New File…
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewMenu(false);
                        setCreating({ parent: root, kind: "folder" });
                        setNewName("");
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[#d4d4d4] transition hover:bg-white/[0.06]"
                    >
                      <FolderIcon open={false} />
                      New Folder…
                    </button>
                  </div>
                </>
              )}
            </div>
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

        {/* Filter box */}
        <div className="relative px-3 pb-1.5 pt-1">
          <svg
            viewBox="0 0 16 16"
            className="pointer-events-none absolute left-[20px] top-1/2 h-3 w-3 -translate-y-1/2 text-[#555555]"
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
            className="w-full rounded-md border border-white/[0.09] bg-[var(--bg-input)] py-[3px] pl-7 pr-2.5 text-[12px] text-[#d4d4d4] placeholder-[#555555] outline-none transition focus:border-[#2b6fd4]"
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

      {/* -- Tree */}
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        {createError && (
          <p className="mx-0.5 mb-1.5 whitespace-pre-wrap rounded-md bg-[#e5534b]/10 px-2 py-1 text-[10.5px] leading-4 text-[#e5534b]">
            {createError}
          </p>
        )}
        {tree.length === 0 && creating?.parent !== root ? (
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

      {/* -- Footer */}
      <div className="flex h-6 shrink-0 items-center justify-between border-t border-white/[0.02] px-3 text-[10px] text-[#555555]">
        <span>{itemCount} item{itemCount === 1 ? "" : "s"}</span>
        {query && <span className="truncate">filtered</span>}
      </div>

      {/* Right-click context menu */}
      {menu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setMenu(null)}
            onContextMenu={(ev) => {
              ev.preventDefault();
              setMenu(null);
            }}
          />
          <div
            className="fixed z-50 w-44 overflow-hidden rounded-lg border border-white/[0.08] bg-[var(--bg-elevated)] py-1 shadow-xl"
            style={{
              left: Math.min(menu.x, window.innerWidth - 190),
              top: Math.min(menu.y, window.innerHeight - 220),
            }}
          >
            <p className="truncate px-3 py-1 text-[10px] uppercase tracking-wider text-[#6b6b6b]">
              {menu.entry.name}
            </p>
            {menu.entry.is_dir && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setMenu(null);
                    setCreating({ parent: menu.entry.path, kind: "file" });
                    setNewName("");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[#d4d4d4] transition hover:bg-white/[0.06]"
                >
                  <FileIcon name="file.ts" /> New File…
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenu(null);
                    setCreating({ parent: menu.entry.path, kind: "folder" });
                    setNewName("");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[#d4d4d4] transition hover:bg-white/[0.06]"
                >
                  <FolderIcon open={false} /> New Folder…
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setRenaming({ path: menu.entry.path, parent: menu.entry.path.replace(/[\\/]+[^\\/]*$/, "") });
                setRenameInput(menu.entry.name);
                setMenu(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[#d4d4d4] transition hover:bg-white/[0.06]"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11.5 1.75l2.75 2.75L5.5 13.25 2 14l.75-3.5z" />
              </svg>
              Rename…
            </button>
            <button
              type="button"
              onClick={() => void deleteEntry(menu.entry)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[#e5534b] transition hover:bg-[#e5534b]/10"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.75 9.5h6.5L12 4M6.5 7v4M9.5 7v4" />
              </svg>
              Delete
            </button>
          </div>
        </>
      )}
        </aside>
  );
}

export default memo(
  FileExplorer,
  (prev, next) =>
    prev.root === next.root &&
    prev.activePath === next.activePath &&
    prev.refreshKey === next.refreshKey &&
    prev.onCollapse === next.onCollapse &&
    prev.width === next.width
);
