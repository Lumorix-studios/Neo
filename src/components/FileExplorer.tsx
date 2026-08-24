import { useCallback, useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FsEntry } from "../agentic";

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

/* ===========================================================================
 * File-type icons — compact, Material-Icon-Theme-style SVGs rendered inline
 * so there are zero asset/network dependencies.
 * ======================================================================== */

const ICON_TEXT_PROPS = {
  textAnchor: "middle" as const,
  dominantBaseline: "central" as const,
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
};

/** Rounded-square language badge with a short label (TS / JS / GO …). */
function Badge({ bg, fg, label }: { bg: string; fg: string; label: string }) {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0">
      <rect x="1.5" y="1.5" width="13" height="13" rx="3.5" fill={bg} />
      <text x="8" y="8.6" fontSize={label.length > 2 ? 5.4 : 6.6} fontWeight="700" fill={fg} {...ICON_TEXT_PROPS}>
        {label}
      </text>
    </svg>
  );
}

const ReactIcon = () => (
  <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0">
    <g stroke="#61dafb" strokeWidth="0.9" fill="none">
      <ellipse cx="8" cy="8" rx="6.4" ry="2.6" />
      <ellipse cx="8" cy="8" rx="6.4" ry="2.6" transform="rotate(60 8 8)" />
      <ellipse cx="8" cy="8" rx="6.4" ry="2.6" transform="rotate(120 8 8)" />
    </g>
    <circle cx="8" cy="8" r="1.35" fill="#61dafb" />
  </svg>
);

const JsonIcon = () => (
  <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0">
    <text x="8" y="8.6" fontSize="9" fontWeight="700" fill="#cbcb41" {...ICON_TEXT_PROPS}>
      {"{}"}
    </text>
  </svg>
);

const CssIcon = () => (
  <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0">
    <path d="M2.5 1.75h11L12.4 13.2 8 14.5l-4.4-1.3z" fill="#663399" />
    <text x="8" y="8.8" fontSize="7" fontWeight="700" fill="#fff" {...ICON_TEXT_PROPS}>
      #
    </text>
  </svg>
);

const HtmlIcon = () => (
  <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0">
    <path d="M2.5 1.75h11L12.4 13.2 8 14.5l-4.4-1.3z" fill="#e44d26" />
    <text x="8" y="8.8" fontSize="6" fontWeight="700" fill="#fff" {...ICON_TEXT_PROPS}>
      {"<>"}
    </text>
  </svg>
);

const PythonIcon = () => (
  <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0">
    <path d="M8 1.5c-2.2 0-3.4.9-3.4 2.4V6H8v.8H3.2C1.8 6.8 1 8 1 9.6c0 1.7.8 2.9 2.2 2.9h1.4v-2c0-1.5 1.2-2.6 2.7-2.6h3.4c1.2 0 2.1-.9 2.1-2.1V3.9C12.8 2.4 10.2 1.5 8 1.5z" fill="#3776ab" />
    <path d="M8 14.5c2.2 0 3.4-.9 3.4-2.4V10H8v-.8h4.8c1.4 0 2.2-1.2 2.2-2.8 0-1.7-.8-2.9-2.2-2.9h-1.4v2c0 1.5-1.2 2.6-2.7 2.6H5.3c-1.2 0-2.1.9-2.1 2.1v1.9c0 1.5 2.6 2.4 4.8 2.4z" fill="#ffd43b" />
    <circle cx="6.1" cy="3.9" r=".65" fill="#fff" />
    <circle cx="9.9" cy="12.1" r=".65" fill="#fff" />
  </svg>
);

const RustIcon = () => (
  <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0">
    <circle cx="8" cy="8" r="5.4" fill="none" stroke="#ce422b" strokeWidth="2.6" strokeDasharray="2.05 1.55" />
    <circle cx="8" cy="8" r="2.1" fill="#ce422b" />
  </svg>
);

const MarkdownIcon = () => (
  <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0">
    <rect x="1" y="3" width="14" height="10" rx="2" fill="#519aba" />
    <text x="5.4" y="8.8" fontSize="6.4" fontWeight="700" fill="#fff" {...ICON_TEXT_PROPS}>
      M
    </text>
    <path d="M10.6 6v3.4m0 0L9.2 8m1.4 1.4L12 8" stroke="#fff" strokeWidth="1.1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ShellIcon = () => (
  <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0">
    <rect x="1.25" y="2.25" width="13.5" height="11.5" rx="2" fill="#1e2430" stroke="#3b4252" strokeWidth="0.8" />
    <path d="M4 6l2 1.7L4 9.4" stroke="#89e051" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7.6 9.8h4" stroke="#89e051" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const ImageIcon = ({ tint = "#7cb342" }: { tint?: string }) => (
  <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0">
    <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.6" fill="none" stroke={tint} strokeWidth="1.2" />
    <circle cx="5.6" cy="6.1" r="1.15" fill="#ffd54f" />
    <path d="M3.4 12l3.1-3.4 2.2 2.3 2.3-2.6 2.6 3.7z" fill={tint} opacity="0.85" />
  </svg>
);

const GitIcon = () => (
  <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0">
    <g stroke="#f4511e" strokeWidth="1.2" fill="none" strokeLinecap="round">
      <path d="M4.5 5.5v5" />
      <path d="M4.5 8c0-2 7-1 7-3" />
    </g>
    <circle cx="4.5" cy="4" r="1.6" fill="#f4511e" />
    <circle cx="4.5" cy="12" r="1.6" fill="#f4511e" />
    <circle cx="11.5" cy="3.6" r="1.6" fill="#f4511e" />
  </svg>
);

const LockIcon = () => (
  <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0">
    <rect x="3.25" y="7" width="9.5" height="7" rx="1.5" fill="#8d8d93" />
    <path d="M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7" fill="none" stroke="#8d8d93" strokeWidth="1.4" />
    <circle cx="8" cy="10.2" r="1" fill="#3f3f46" />
  </svg>
);

const DatabaseIcon = () => (
  <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0">
    <g fill="none" stroke="#dd6b20" strokeWidth="1.2">
      <ellipse cx="8" cy="4" rx="5.5" ry="2.1" />
      <path d="M2.5 4v8c0 1.16 2.46 2.1 5.5 2.1s5.5-.94 5.5-2.1V4" />
      <path d="M2.5 8c0 1.16 2.46 2.1 5.5 2.1S13.5 9.16 13.5 8" />
    </g>
  </svg>
);

const RubyIcon = () => (
  <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0">
    <path d="M4.5 2.5h7L14 6l-6 7.5L2 6z" fill="#cc342d" />
    <path d="M4.5 2.5L8 6l3.5-3.5M2 6h12M8 6l-2 7.5M8 6l2 7.5" stroke="#fff" strokeWidth="0.55" opacity="0.55" fill="none" />
  </svg>
);

/** Document sheet with folded corner + optional accent lines. */
const DocIcon = ({ tint = "#8d8d93", lines = true }: { tint?: string; lines?: boolean }) => (
  <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0">
    <path d="M4 1.75h5.2L12.5 5v8.25a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-10.5a1 1 0 0 1 1-1z" fill="none" stroke={tint} strokeWidth="1.15" strokeLinejoin="round" />
    <path d="M9.2 1.75V5h3.3" fill="none" stroke={tint} strokeWidth="1.15" strokeLinejoin="round" />
    {lines && (
      <g stroke={tint} strokeWidth="1" strokeLinecap="round" opacity="0.7">
        <path d="M5.2 8h5.6M5.2 10.4h5.6M5.2 12.4h3.4" />
      </g>
    )}
  </svg>
);

function FileIcon({ name }: { name: string }) {
  const lower = name.toLowerCase();
  const ext = lower.includes(".") ? lower.split(".").pop()! : "";

  if (lower === ".gitignore" || lower === ".gitattributes" || lower === ".gitmodules") return <GitIcon />;
  if (lower.endsWith(".lock")) return <LockIcon />;
  if (lower.startsWith("dockerfile")) return (
    <Badge bg="#2496ed" fg="#ffffff" label="DK" />
  );

  switch (ext) {
    case "ts": case "mts": return <Badge bg="#3178c6" fg="#ffffff" label="TS" />;
    case "tsx": case "jsx": return <ReactIcon />;
    case "js": case "mjs": case "cjs": return <Badge bg="#f7df1e" fg="#111111" label="JS" />;
    case "json": case "jsonc": return <JsonIcon />;
    case "css": case "scss": case "less": return <CssIcon />;
    case "html": case "htm": case "xml": return <HtmlIcon />;
    case "svg": return <ImageIcon tint="#ffb74d" />;
    case "py": case "pyw": return <PythonIcon />;
    case "rs": return <RustIcon />;
    case "md": case "markdown": return <MarkdownIcon />;
    case "sh": case "bash": case "zsh": case "ps1": return <ShellIcon />;
    case "png": case "jpg": case "jpeg": case "gif": case "webp": case "bmp": case "ico": case "avif":
      return <ImageIcon />;
    case "sql": return <DatabaseIcon />;
    case "go": return <Badge bg="#00add8" fg="#111111" label="GO" />;
    case "java": return <Badge bg="#b07219" fg="#ffffff" label="JV" />;
    case "c": case "h": return <Badge bg="#5c6bc0" fg="#ffffff" label="C" />;
    case "cpp": case "cc": case "hpp": return <Badge bg="#f34b7d" fg="#ffffff" label="C+" />;
    case "cs": return <Badge bg="#178600" fg="#ffffff" label="C#" />;
    case "rb": return <RubyIcon />;
    case "php": return <Badge bg="#4f5d95" fg="#ffffff" label="PH" />;
    case "swift": return <Badge bg="#f05138" fg="#ffffff" label="SW" />;
    case "kt": case "kts": return <Badge bg="#a97bff" fg="#111111" label="KT" />;
    case "yaml": case "yml": return <DocIcon tint="#ef5350" />;
    case "toml": return <DocIcon tint="#ff7043" />;
    case "txt": case "log": return <DocIcon />;
    default: return <DocIcon />;
  }
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