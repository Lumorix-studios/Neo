/**
 * Shared, VS Code Seti-style file icons built from Simple Icons brand glyphs
 * (`react-icons/si`) with authentic brand colours. Used by both the explorer
 * and the editor tab strip so the whole app shows consistent, modern icons.
 */
import type { ReactNode } from "react";
import {
  SiC,
  SiCplusplus,
  SiCss,
  SiDocker,
  SiGit,
  SiGo,
  SiGnubash,
  SiHtml5,
  SiJavascript,
  SiJson,
  SiKotlin,
  SiMarkdown,
  SiNpm,
  SiPhp,
  SiPython,
  SiReact,
  SiRuby,
  SiRust,
  SiSass,
  SiSharp,
  SiSwift,
  SiTailwindcss,
  SiTypescript,
  SiVite,
  SiVuedotjs,
  SiYaml,
} from "react-icons/si";
import { FaJava } from "react-icons/fa";

/** Accent colour for a path's language — used for tab underlines etc. */
export function langColorOf(path: string): string {
  const lower = path.toLowerCase();
  const name = lower.split(/[\\/]/).pop() ?? lower;
  const ext = name.includes(".") ? name.split(".").pop()! : "";
  if (name === "package.json") return "#cb3837";
  if (name.startsWith("vite.config")) return "#646cff";
  if (name.startsWith("tailwind.config") || name === "tailwind.css") return "#38bdf8";
  switch (ext) {
    case "ts": case "mts": return "#3178c6";
    case "tsx": case "jsx": return "#61dafb";
    case "js": case "mjs": case "cjs": return "#f7df1e";
    case "json": return "#cbcb41";
    case "css": return "#663399";
    case "scss": case "sass": return "#cc6699";
    case "less": return "#2b5e88";
    case "html": case "htm": return "#e34f26";
    case "vue": return "#42b883";
    case "py": case "pyw": return "#3776ab";
    case "rs": return "#e43717";
    case "go": return "#00add8";
    case "java": return "#e76f00";
    case "c": case "h": return "#a8b9cc";
    case "cpp": case "cc": case "hpp": return "#00599c";
    case "cs": return "#239120";
    case "rb": return "#cc342d";
    case "php": return "#777bb4";
    case "swift": return "#f05138";
    case "kt": case "kts": return "#7f52ff";
    case "md": case "markdown": return "#519aba";
    case "sh": case "bash": case "zsh": return "#89e051";
    case "yml": case "yaml": return "#cb171e";
    default: return "#8d8d93";
  }
}

/** Folded-corner document fallback for unknown types. */
function DocIcon({ tint }: { tint: string }) {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0">
      <path
        d="M4 1.75h5.2L12.5 5v8.25a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-10.5a1 1 0 0 1 1-1z"
        fill="none" stroke={tint} strokeWidth="1.15" strokeLinejoin="round"
      />
      <path d="M9.2 1.75V5h3.3" fill="none" stroke={tint} strokeWidth="1.15" strokeLinejoin="round" />
      <g stroke={tint} strokeWidth="1" strokeLinecap="round" opacity="0.65">
        <path d="M5.2 8h5.6M5.2 10.4h5.6M5.2 12.4h3.4" />
      </g>
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0">
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.6" fill="none" stroke="#7cb342" strokeWidth="1.2" />
      <circle cx="5.6" cy="6.1" r="1.15" fill="#ffd54f" />
      <path d="M3.4 12l3.1-3.4 2.2 2.3 2.3-2.6 2.6 3.7z" fill="#7cb342" opacity="0.85" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0">
      <rect x="3.25" y="7" width="9.5" height="7" rx="1.5" fill="#8d8d93" />
      <path d="M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7" fill="none" stroke="#8d8d93" strokeWidth="1.4" />
      <circle cx="8" cy="10.2" r="1" fill="#3f3f46" />
    </svg>
  );
}

/** Brand icon wrapper: normalises size + applies the official colour. */
function Brand({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center" style={{ color }}>
      {children}
    </span>
  );
}

const ICON_PROPS = { className: "h-3.5 w-3.5" } as const;

/** Modern language/file icon for a filename or full path. */
export function FileIcon({ name }: { name: string }) {
  const lower = name.toLowerCase();
  const base = lower.split(/[\\/]/).pop() ?? lower;
  const ext = base.includes(".") ? base.split(".").pop()! : "";

  // ── Well-known filenames first ──────────────────────────────────────────
  if (base === ".gitignore" || base === ".gitattributes" || base === ".gitmodules")
    return <Brand color="#f05032"><SiGit {...ICON_PROPS} /></Brand>;
  if (base === "package.json")
    return <Brand color="#cb3837"><SiNpm {...ICON_PROPS} /></Brand>;
  if (base.endsWith(".lock"))
    return <LockIcon />;
  if (base.startsWith("dockerfile") || base.startsWith("docker-compose"))
    return <Brand color="#2496ed"><SiDocker {...ICON_PROPS} /></Brand>;
  if (base.startsWith("vite.config"))
    return <Brand color="#646cff"><SiVite {...ICON_PROPS} /></Brand>;
  if (base.startsWith("tailwind.config"))
    return <Brand color="#38bdf8"><SiTailwindcss {...ICON_PROPS} /></Brand>;

  switch (ext) {
    case "ts": case "mts":
      return <Brand color="#3178c6"><SiTypescript {...ICON_PROPS} /></Brand>;
    case "tsx": case "jsx":
      return <Brand color="#61dafb"><SiReact {...ICON_PROPS} /></Brand>;
    case "js": case "mjs": case "cjs":
      return <Brand color="#f7df1e"><SiJavascript {...ICON_PROPS} /></Brand>;
    case "json": case "jsonc":
      return <Brand color="#cbcb41"><SiJson {...ICON_PROPS} /></Brand>;
    case "vue":
      return <Brand color="#42b883"><SiVuedotjs {...ICON_PROPS} /></Brand>;
    case "scss": case "sass":
      return <Brand color="#cc6699"><SiSass {...ICON_PROPS} /></Brand>;
    case "css":
      return <Brand color="#663399"><SiCss {...ICON_PROPS} /></Brand>;
    case "less":
      return <Brand color="#2b5e88"><SiCss {...ICON_PROPS} /></Brand>;
    case "html": case "htm":
      return <Brand color="#e34f26"><SiHtml5 {...ICON_PROPS} /></Brand>;
    case "py": case "pyw":
      return <Brand color="#3776ab"><SiPython {...ICON_PROPS} /></Brand>;
    case "rs":
      return <Brand color="#e43717"><SiRust {...ICON_PROPS} /></Brand>;
    case "go":
      return <Brand color="#00add8"><SiGo {...ICON_PROPS} /></Brand>;
    case "java":
      return <Brand color="#e76f00"><FaJava {...ICON_PROPS} /></Brand>;
    case "c": case "h":
      return <Brand color="#a8b9cc"><SiC {...ICON_PROPS} /></Brand>;
    case "cpp": case "cc": case "hpp":
      return <Brand color="#00599c"><SiCplusplus {...ICON_PROPS} /></Brand>;
    case "cs":
      return <Brand color="#239120"><SiSharp {...ICON_PROPS} /></Brand>;
    case "rb":
      return <Brand color="#cc342d"><SiRuby {...ICON_PROPS} /></Brand>;
    case "php":
      return <Brand color="#777bb4"><SiPhp {...ICON_PROPS} /></Brand>;
    case "swift":
      return <Brand color="#f05138"><SiSwift {...ICON_PROPS} /></Brand>;
    case "kt": case "kts":
      return <Brand color="#7f52ff"><SiKotlin {...ICON_PROPS} /></Brand>;
    case "md": case "markdown":
      return <Brand color="#519aba"><SiMarkdown {...ICON_PROPS} /></Brand>;
    case "sh": case "bash": case "zsh":
      return <Brand color="#89e051"><SiGnubash {...ICON_PROPS} /></Brand>;
    case "yml": case "yaml":
      return <Brand color="#cb171e"><SiYaml {...ICON_PROPS} /></Brand>;
    case "png": case "jpg": case "jpeg": case "gif": case "webp": case "ico": case "bmp":
      return <ImageIcon />;
    default:
      return <DocIcon tint="#8d8d93" />;
  }
}


