/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/madhusudhan-rgb/Neo) for more information on permissions to use this code.
 */
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
import { IoDocumentOutline, IoImageOutline, IoLockClosedOutline } from "react-icons/io5";

/** Folded-corner document fallback for unknown types. */
function DocIcon({ tint }: { tint: string }) {
  return (
    <IoDocumentOutline className="h-4 w-4 shrink-0" color={tint} />
  );
}

function ImageIcon() {
  return (
    <IoImageOutline className="h-4 w-4 shrink-0" color="#7cb342" />
  );
}

function LockIcon() {
  return (
    <IoLockClosedOutline className="h-4 w-4 shrink-0" color="#8d8d93" />
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


