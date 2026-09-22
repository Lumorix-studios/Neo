//this file functions as the topmenu bar prop in the main chatinterface window
//all the menu items are defined here and the actions are passed as props to this component


import { openUrl } from "@tauri-apps/plugin-opener";
import { useState, useEffect, useRef, useMemo, type ReactNode } from "react";
import { useErrorHandler } from "../src/errorContext";
import WindowControls from "./WindowControls";
import { IoChevronForward, IoSearch, IoLogoWindows,IoLogoApple,IoLogoTux  } from "react-icons/io5";
import {
  type ReleaseInfo,
  type ReleaseAsset,
  RELEASE_URL,
  RELEASES_PAGE,
  REPO_PAGE,
  findPlatformAsset,
  checkForUpdate,
  type UpdateCheckResult,
} from "../src/lib/updateCheck";
type OsKey = "windows" | "linux" | "macos" | "other";
function detectOs(): OsKey {
  if (typeof navigator === "undefined") return "other";
  const userAgent = navigator.userAgent;
  if (userAgent.includes("Windows")) return "windows";
  if (userAgent.includes("Linux")) return "linux";
  if (userAgent.includes("Mac")) return "macos";
  return "other";
}
const OS_LABEL :Record<OsKey, string> = {
  windows : "Windows",
  linux  : "Linux",
  macos : "macOS",
  other : "Other"
}
function formatSize(bytes : number ) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}
function formatDate(iso?: string) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year:"numeric",
      month : "short",
      day:"numeric",

    });
  }catch {return null;
  }
}
function findAsset(assets : ReleaseAsset[], ext :string){
  return assets.find((a) => a.name.toLowerCase().endsWith(ext.toLowerCase()));
}
function PlatformIcon({ os }: { os: OsKey }) {
  if (os === "windows") {
    return <IoLogoWindows className="h-5 w-5" />;
  }

  if (os === "macos") {
    return <IoLogoApple className="h-5 w-5" />;
  }

  return <IoLogoTux className="h-5 w-5" />;
}
interface TopMenuProps {
  onOpenInfoPanel: () => void;
  onOpenPrivacyPolicy: () => void;
  onOpenTab2: () => void;
  onOpenAiSettings: () => void;
  onOpenChatHistory: () => void;
  onOpenIde: () => void;
  onOpenTerminal: () => void;
  onOpenSettings?: () => void;
  /** Opens the command palette from the title-bar "command center" pill. */
  onOpenCommandPalette?: () => void;
  /** Opens the full IDE in its own window (Cursor-style "IDE →"). */
  onOpenIdeWindow?: () => void;
  /** Fires a background check for a newer release and, when one is found,
   *  causes the app to show the in-app update notification. */
  onCheckForUpdates?: () => void;
  /** Optional right-aligned slot (model pill, actions) rendered in the title bar. */
  right?: ReactNode;
  /** Trigger a deep project analysis by the agent. */
  onAnalyzeProject?: () => void;
  /** Trigger a session save/export. */
  onSaveSession?: () => void;
  /** Pin a file to the agent's context. */
  onPinFile?: (path: string) => void;
  /** Workspace folder entries shown in the Context menu. */
  contextEntries?: { name: string; path: string; is_dir: boolean }[];
  /** Paths currently pinned to the agent's context. */
  pinnedPaths?: string[];
}

interface MenuDef {
  label: string;
  items: { label: string; action: () => void; shortcut?: string; disabled?: boolean }[];
}

export default function TopMenu({
  onOpenInfoPanel,
  // onOpenPrivacyPolicy,  //this was the actual tab prop but that isnt needed and is deprecated
  onOpenTab2,
  onOpenAiSettings,
  onOpenChatHistory,
  onOpenIde,
  onOpenTerminal,
  onOpenSettings,
  onOpenCommandPalette,
  onOpenIdeWindow,
  onAnalyzeProject,
  onSaveSession,
  onPinFile,
  contextEntries,
  pinnedPaths,
  right,
}: TopMenuProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [release, setRelease] = useState<ReleaseInfo | null>(null);

  const os = useMemo(() => detectOs(), []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const load = async () => {
      try {
        const response = await fetch(RELEASE_URL, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Could not reach the releases service.");
        }

        const data = (await response.json()) as ReleaseInfo;

        if (!cancelled) {
          setRelease(data);
        }
      } catch (err) {
        if (
          !cancelled &&
          !(err instanceof DOMException && err.name === "AbortError")
        ) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load release info."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const assets = release?.assets ?? [];
  const version = release ? parseVersion(release.tag_name) : null;
  const date = formatDate(release?.published_at);

  const exe = findAsset(assets, ".exe");
  const msi = findAsset(assets, ".msi");
  const deb = findAsset(assets, ".deb");
  const rpm = findAsset(assets, ".rpm");
  const dmg = findAsset(assets, ".dmg");

  const primary =
    os === "windows"
      ? exe ?? msi
      : os === "macos"
        ? dmg
        : os === "linux"
          ? deb ?? rpm
          : exe ?? msi ?? dmg ?? deb ?? rpm;

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { reportError } = useErrorHandler();

  const openDocs = async () => {
    try {
      await openUrl("https://lumorix-studios.github.io/LumorixStudiosHq/Documentation");
    } catch (error) {
      reportError(error);
    }
  };
const openPrivacyPolicy = async () => {
    try {
      await openUrl("https://lumorix-studios.github.io/LumorixStudiosHq/privacypolicyandterms");
    } catch (error) {
      reportError(error);
    }
  };
  const pinned = new Set(pinnedPaths ?? []);
  /** Workspace entries for the Context menu — files are pinnable, folders are informational. */
  const contextItems: MenuDef["items"] = (contextEntries ?? []).slice(0, 25).map((e) => ({
    label: `${pinned.has(e.path) ? "📌 " : ""}${e.is_dir ? "📁 " : "📄 "}${e.name}`,
    action: () => onPinFile?.(e.path),
    disabled: e.is_dir || !onPinFile,
  }));

  const menus: MenuDef[] = [
    {
      label: "Context",
      items: [
        {
          label: "Analyze Project",
          action: () => onAnalyzeProject?.(),
          disabled: !onAnalyzeProject,
        },
        {
          label: "Save Session…",
          action: () => onSaveSession?.(),
          disabled: !onSaveSession,
        },
        ...(contextItems.length > 0
          ? [
              {
                label: "(click to target the specific file in the agent's context)",
                action: () => {},
                disabled: true,
              },
              ...contextItems,
            ]
          : [
              {
                label: "No folder open — open a workspace to pin files",
                action: () => {},
                disabled: true,
              },
            ]),
      ],
    },
    {
      label: "File",
      items: [
        { label: "New Chat", action: onOpenChatHistory, shortcut: "Ctrl+Shift+H" },
        { label: "Open Editor", action: onOpenIde, shortcut: "Ctrl+Shift+E" },
        
      ],
    },
    {
      label: "View",
      items: [
        { label: "Chat History", action: onOpenChatHistory, shortcut: "Ctrl+Shift+H" },
        { label: "Open Terminal", action: onOpenTerminal, shortcut: "Ctrl+`" },
        { label: "AI Settings…", action: onOpenAiSettings, shortcut: "Ctrl+B" },
        ...(onOpenSettings
          ? [{ label: "Settings…", action: onOpenSettings, shortcut: "Ctrl+," }]
          : []),
      ],
    },
    {
      label: "Help",
      items: [
        { label: "Documentation", action: openDocs },
        { label: "About & Contact", action: onOpenInfoPanel },
        { label: "Privacy Policy", action: openPrivacyPolicy },
        { label: "Rate Neo", action: onOpenTab2 },
        ...(onCheckForUpdates
          ? [{ label: "Check for Updates…", action: onCheckForUpdates }]
          : []),
      ],
    },
  ];

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <nav
      ref={menuRef}
      className="relative z-50 flex h-[35px] shrink-0 items-center border-b border-(--border) bg-[var(--bg-panel)] pl-3 pr-2"
      data-tauri-drag-region="deep"
    >
      {/* Left: brand + menus */}
      <div className="flex min-w-0 flex-1 items-center justify-start gap-1">
        <div
          className="mr-1.5 flex items-center gap-2 select-none"
          data-tauri-drag-region="deep"
        >
          <span className="relative flex h-6 w-6 items-center justify-center">
            <img
              src="/app-icon.png"
              alt="Neo"
              className="h-5 w-5 rounded-md"
            />
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-(--accent)"
            />
          </span>
          <span className="text-[12.5px] font-semibold tracking-tight text-[var(--text-primary)]">
            Neo
          </span>
        </div>

        <div className="flex items-center gap-0.5">
          {menus.map((menu) => (
            <div key={menu.label} className="relative">
              <button
                onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
                onMouseEnter={() => openMenu && setOpenMenu(menu.label)}
                className={`rounded-[4px] px-2 py-[3px] text-[12.5px] transition-colors ${
                  openMenu === menu.label
                    ? "bg-(--fill-2) text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:bg-(--fill-2) hover:text-[var(--text-primary)]"
                }`}
              >
                {menu.label}
              </button>

              {openMenu === menu.label && (
                <div className="panel-in absolute left-0 top-full z-50 mt-px w-64 overflow-hidden rounded-[5px] border border-(--border-strong) bg-[var(--bg-elevated)] p-[3px] shadow-[0_8px_24px_rgba(0,0,0,0.55)]">
                  {menu.items.map((item, i) => (
                    <button
                      key={i}
                      disabled={item.disabled}
                      onClick={() => {
                        item.action();
                        setOpenMenu(null);
                      }}
                      className="flex w-full items-center justify-between rounded-[3px] px-2.5 py-[5px] text-left text-[12.5px] text-[var(--text-primary)] transition-colors hover:bg-(--fill-2) hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span>{item.label}</span>
                      {item.shortcut && (
                        <span className="ml-8 text-[11px] tracking-wide text-[var(--text-muted)]">
                          {item.shortcut}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        {onOpenIdeWindow && (
          <button
            type="button"
            onClick={onOpenIdeWindow}
            title="Open the IDE in its own window (explorer, git, terminal)"
            className="ml-1.5 flex items-center gap-1 rounded-[4px] bg-(--fill-2) px-2 py-[3px] text-[11.5px] font-medium text-[var(--text-primary)] transition-colors hover:bg-(--fill-3) hover:text-[var(--text-primary)]"
          >
            IDE
            <IoChevronForward size={10} />
          </button>
        )}
      </div>
      {/* Center: command-palette pill — in-flow between two equal flex columns
          so it stays truly centered while the left/right groups shrink
          and truncate with the window width. */}
      {onOpenCommandPalette && (
        <div className="hidden min-w-0 flex-none items-center justify-center px-2 lg:flex">
          <button
            type="button"
            onClick={onOpenCommandPalette}
            title="Search commands and files (Ctrl+P)"
            className="flex h-[22px] w-[min(28vw,280px)] items-center justify-center gap-2 rounded-[6px] border border-(--border-strong) bg-(--fill-1) text-[11.5px] text-[var(--text-muted)] transition-colors hover:border-(--border-strong) hover:bg-(--fill-2) hover:text-[var(--text-primary)]"
          >
            <IoSearch size={11} />
            Search Neo
          </button>
        </div>
      )}
      {/* Right: provider/model pill + window controls */}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        {right && <div className="flex min-w-0 items-center gap-2">{right}</div>}
        <WindowControls />
      </div>
    </nav>
  );
}