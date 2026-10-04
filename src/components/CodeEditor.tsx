/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/Lumorix-studios/Struct) for more information on permissions to use this code.
 */
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { KeyboardEvent as ReactKeyboardEvent, UIEvent as ReactUIEvent } from "react";
import { countLines, highlightWindow, langOf, commentToken } from "./highlight";
import { useFileDiagnostics, type DiagnosticSeverity } from "../diagnostics";
import {
  diagnosticTooltip,
  indexFileDiagnostics,
  layoutDiagnosticMarks,
  MARK_LEFT_PAD,
  visibleLineTexts,
} from "./editorDiagnostics";
import { FileIcon } from "./FileIcon";
import FindReplaceBar from "./FindReplaceBar";
import {
  historyFor,
  recordEdit,
  resetFileHistory,
  resetHistory,
  redoHistory,
  setHistoryPresenter,
  undoHistory,
  type EditorSnapshot,
} from "./editorHistory";
import TextType from '../../components/TextType';
import { IoChevronForward, IoClipboardOutline, IoClose, IoCodeSlashOutline, IoCopyOutline, IoCutOutline, IoListOutline, IoSearch, IoTrashOutline } from "react-icons/io5";
export interface EditorTab {
  path: string;
  content: string;
  dirty: boolean;
}

/** Editor preferences driven by the Settings tab. */
export interface EditorPrefs {
  fontSize: number;
  lineHeight: number;
  tabSize: number;
  wordWrap: boolean;
  showLineNumbers: boolean;
}

export const DEFAULT_EDITOR_PREFS: EditorPrefs = {
  fontSize: 12.5,
  lineHeight: 20,
  tabSize: 2,
  wordWrap: false,
  showLineNumbers: true,
};

/** Data + actions for the no-file-open empty state. */
export interface EmptyStateInfo {
  hasWorkspace: boolean;
  onOpenFolder?: () => void;
  onOpenFiles?: () => void;
  /** Create an (empty) file relative to the workspace root. */
  onCreateFile?: (name: string) => void;
  recentFiles?: string[];
  onOpenRecent?: (path: string) => void;
}

export interface CodeEditorProps {
  tabs: EditorTab[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onChange: (path: string, content: string) => void;
  onSave: (path: string) => void;
  onCloseAll?: () => void;
  /** Scroll the active tab to this file+line (problems panel jumps). */
  reveal?: { path: string; line: number } | null;
  /** Appearance + behavior prefs (from Settings). Falls back to defaults. */
  prefs?: Partial<EditorPrefs>;
  /** Empty-state content: actions and recents. */
  emptyState?: EmptyStateInfo;
  /** Report caret position for the status bar (1-based line/col). */
  onCursorChange?: (pos: { line: number; col: number; sel: number }) => void;
}

/** Top padding shared by the gutter, highlight layer and textarea. */
const PAD_TOP = 10;

/** Diagnostic colours: VS Code-ish red / amber / blue, one source of truth for
 *  the gutter marker, the squiggle and the line-number tint. */
const DIAG_COLOR: Record<DiagnosticSeverity, string> = {
  error: "#e5534b",
  warning: "#e2b93d",
  info: "#4a9eff",
};

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function pathSegments(path: string): string[] {
  return path.split(/[\\/]/).filter(Boolean);
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Find all non-overlapping match offsets of `query` in `text`. */
function computeMatches(
  text: string,
  query: string,
  caseSensitive: boolean
): Array<{ start: number; end: number }> {
  if (!query) return [];
  try {
    const re = new RegExp(escapeRegExp(query), caseSensitive ? "g" : "gi");
    const out: Array<{ start: number; end: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) break; // avoid infinite loop on zero-width
      out.push({ start: m.index, end: m.index + m[0].length });
    }
    return out;
  } catch {
    return [];
  }
}

/** Convert a char offset into 0-based {line, col} within `text`. */
function offsetToLineCol(text: string, offset: number): { line: number; col: number } {
  const before = text.slice(0, offset);
  const lines = before.split("\n");
  return { line: lines.length - 1, col: lines[lines.length - 1].length };
}

export interface FindMark {
  key: number;
  top: number;
  left: number;
  width: number;
}

/** Monospace-positioned highlight marks for every match. Kept at module scope
 *  (pure, no component state) so the React Compiler can memoize the call
 *  without a hand-written `useMemo`. */
function collectFindMarks(
  active: boolean,
  matches: Array<{ start: number; end: number }>,
  content: string,
  charW: number,
  lineHeight: number
): FindMark[] {
  if (!active || matches.length === 0) return [];
  return matches.slice(0, 500).map((m) => {
    const startPt = offsetToLineCol(content, m.start);
    const endPt = offsetToLineCol(content, m.end);
    return {
      key: m.start,
      top: PAD_TOP + startPt.line * lineHeight,
      left: 16 + startPt.col * charW,
      width: Math.max(3, (endPt.col - startPt.col) * charW),
    };
  });
}

interface LineNumberGutterProps {
  lineCount: number;
  /** Worst severity per 1-based line → error/warning marker in the gutter. */
  worstByLine?: Map<number, DiagnosticSeverity>;
  width: number;
  fontSize: number;
  lineHeight: number;
  padTop: number;
  innerRef: RefObject<HTMLDivElement | null>;
  /** First visible line (0-based). */
  scrollTop: number;
  /** Viewport height in px, used to size the render window. */
  viewportH: number;
  /** 1-based caret line, or -1 when line numbers are hidden. */
  activeLine: number;
}

/* Only the lines inside the viewport (plus a small overscan) are mounted. The
   committed version rendered a row per line and slid the whole stack with
   `translateY(-scrollTop)`, so a 9k-line file created 9k DOM nodes up front and
   reconciled all of them on every tab switch. This caps the mounted rows at
   roughly `viewportH / lineHeight` + overscan whatever the file size. */
const GUTTER_OVERSCAN = 20;

/**
 * The window of line numbers the gutter should mount, and where to place it.
 *
 * `first`/`last` are the half-open range of line indices to mount. Its length
 * never exceeds `ceil(viewportH / lineHeight) + 2 * overscan`, however long the
 * file is, and the range always covers the rows on screen.
 *
 * `offsetY` is where that window box goes, expressed in the gutter's own
 * coordinate space. The gutter is a viewport-height box that is clipped and
 * NEVER scrolls, so rows are placed at their document offset MINUS the scroll
 * offset (`padTop + i * lineHeight - scrollTop`) — the same convention the
 * active-line overlay uses. Without the `- scrollTop` term the window sits at a
 * document offset inside a box that never scrolls: it slides further out of the
 * clip on every scroll and disappears completely once `first * lineHeight`
 * exceeds the viewport height.
 */
export function gutterWindow(
  lineCount: number,
  scrollTop: number,
  viewportH: number,
  lineHeight: number,
  padTop: number,
  overscan: number = GUTTER_OVERSCAN
): { first: number; last: number; offsetY: number } {
  const rows = Math.max(1, Math.ceil(viewportH / lineHeight) + overscan * 2);
  const firstVisible = Math.max(0, Math.floor((scrollTop - padTop) / lineHeight));
  // Clamp `first` so the window always lands inside the file. Without the second
  // clamp, a scrollTop past EOF (or a short file in a tall viewport) could produce
  // a window beyond the end of the file and the numbers would vanish entirely.
  const first = Math.min(
    Math.max(0, firstVisible - overscan),
    Math.max(0, lineCount - rows)
  );
  return {
    first,
    last: Math.min(lineCount, first + rows),
    offsetY: padTop + first * lineHeight - scrollTop,
  };
}

const LineNumberGutter = memo(function LineNumberGutter({
  lineCount,
  worstByLine,
  width,
  fontSize,
  lineHeight,
  padTop,
  innerRef,
  scrollTop,
  viewportH,
  activeLine,
}: LineNumberGutterProps) {
  const { first, last, offsetY } = gutterWindow(
    lineCount,
    scrollTop,
    viewportH,
    lineHeight,
    padTop
  );
  const rows: number[] = [];
  for (let i = first; i < last; i++) rows.push(i);

  return (
    <div
      className="relative shrink-0 select-none overflow-hidden bg-[var(--bg-editor)] text-right font-mono"
      style={{ width, fontSize }}
      aria-hidden
    >
      {/* `offsetY` already accounts for the scroll, so row `i` lands at
          `padTop + i * lineHeight - scrollTop` — the same screen position the
          textarea gives that line. Overscan rows fall outside this clipped box;
          they are what stops a fast scroll exposing a blank strip while the
          published viewport is one frame behind. */}
      <div
        ref={innerRef}
        className="absolute inset-x-0 top-0"
        style={{ transform: `translateY(${offsetY}px)` }}
      >
        {rows.map((i) => {
          const sev = worstByLine?.get(i + 1);
          return (
            <div
              key={i}
              data-ln={i + 1}
              className={
                i + 1 === activeLine
                  ? "gutter-active font-medium text-[var(--text-secondary)]"
                  : sev
                    ? "font-medium"
                    : "text-[var(--text-faint)]"
              }
              style={{
                height: lineHeight,
                lineHeight: `${lineHeight}px`,
                paddingRight: 12,
                color: sev && i + 1 !== activeLine ? DIAG_COLOR[sev] : undefined,
              }}
            >
              {/* Error/warning dot: the line-level cue that survives small text
                  and is the same colour as the squiggle. Rows without a finding
                  render exactly as before (no extra space, no shift). */}
              {sev ? (
                <>
                  <span
                    className="inline-block h-[5px] w-[5px] rounded-full align-middle"
                    style={{ background: DIAG_COLOR[sev] }}
                  />
                  {" "}
                </>
              ) : null}
              {i + 1}
            </div>
          );
        })}
      </div>
    </div>
  );
});

// Wrapped in memo: the IDE parent re-renders on every keystroke (the tab array
// is its state), and without this the whole editor subtree — gutter, highlight
// layer, tab strip — reconciles on each character. Props are compared shallowly;
// the parent passes stable callbacks and memoized prefs/emptyState objects.
export default memo(function CodeEditor({
  tabs,
  activePath,
  onSelect,
  onClose,
  onCloseAll,
  onChange,
  onSave,
  reveal,
  prefs,
  emptyState,
  onCursorChange,
}: CodeEditorProps) {
  // Metrics shared by the gutter, highlight layer and textarea so they stay
  // pixel-aligned. Derived per-render from the Settings-driven prefs.
  const LINE_HEIGHT = prefs?.lineHeight ?? DEFAULT_EDITOR_PREFS.lineHeight;
  const FONT_SIZE = prefs?.fontSize ?? DEFAULT_EDITOR_PREFS.fontSize;
  const TAB_SIZE = prefs?.tabSize ?? DEFAULT_EDITOR_PREFS.tabSize;
  const WORD_WRAP = prefs?.wordWrap ?? DEFAULT_EDITOR_PREFS.wordWrap;
  const SHOW_LINE_NUMBERS = prefs?.showLineNumbers ?? DEFAULT_EDITOR_PREFS.showLineNumbers;
  const indentUnit = " ".repeat(TAB_SIZE);
  const [newFileName, setNewFileName] = useState("");
  const [creatingFile, setCreatingFile] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);
  const [matchIndex, setMatchIndex] = useState(-1);
  const [goToOpen, setGoToOpen] = useState(false);
  const [goToInput, setGoToInput] = useState("");
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const active = tabs.find((t) => t.path === activePath) ?? null;
  const preRef = useRef<HTMLPreElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Scroll bookkeeping via refs + direct DOM writes: driving these through
  // React state re-rendered the entire editor (gutter + highlight layer) on
  // every scroll tick and keystroke, which felt laggy on large files.
  const scrollTopRef = useRef(0);
  const gutterInnerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const activeBandRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState({ line: 1, col: 1, sel: 0 });

  /* Viewport state for the virtualized gutter. Scroll position has to be real
     state (not just a ref) because the window of mounted line numbers depends on
     it. It is written at most once per animation frame, so a fast scroll still
     costs a single React commit per frame rather than one per event. */
  const [viewport, setViewport] = useState({ scrollTop: 0, h: 600 });
  const scrollRafRef = useRef(0);
  const publishViewport = useCallback(() => {
    scrollRafRef.current = 0;
    const el = taRef.current;
    if (!el) return;
    setViewport((prev) =>
      prev.scrollTop === el.scrollTop && prev.h === el.clientHeight
        ? prev
        : { scrollTop: el.scrollTop, h: el.clientHeight }
    );
  }, []);
  const scheduleViewport = useCallback(() => {
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(publishViewport);
  }, [publishViewport]);
  /* Indirection so `applyScrollTransforms` (declared below) can request a
     viewport publish without depending on declaration order. It points at the
     rAF-coalesced scheduler, NOT the publisher: writing state synchronously
     inside a scroll event re-rendered mid-scroll, and — because typing near the
     bottom of the viewport makes the browser scroll the caret into view, which
     fires `scroll` — mid-keystroke as well. */
  const scheduleViewportRef = useRef(scheduleViewport);
  useLayoutEffect(() => {
    scheduleViewportRef.current = scheduleViewport;
  });
  // Track viewport height so the window stays correct on window resize / panel
  // collapse, where no scroll event fires.
  useEffect(() => {
    const el = taRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => scheduleViewport());
    ro.observe(el);
    publishViewport();
    return () => ro.disconnect();
  }, [publishViewport, scheduleViewport]);
  useEffect(() => () => cancelAnimationFrame(scrollRafRef.current), []);

  const activeContent = active?.content ?? "";
  const activeLang = active ? langOf(active.path) : "text";
  // Memoized: this ran on every render, and there are several renders per
  // keystroke (caret sync, viewport publish), each re-scanning the whole buffer.
  const lineCount = useMemo(() => countLines(activeContent), [activeContent]);

  /** Align every visual layer with the textarea's scroll position using
   *  direct DOM writes — no React re-render per scroll tick. Declared before
   *  the effects below so they can reference it without hoisting. */
  const applyScrollTransforms = useCallback(() => {
    const st = scrollTopRef.current;
    const el = taRef.current;
    if (preRef.current) {
      preRef.current.scrollTop = st;
      preRef.current.scrollLeft = el?.scrollLeft ?? 0;
    }
    if (overlayRef.current) {
      overlayRef.current.style.transform = `translateY(${-st}px)`;
    }
    // The gutter is deliberately NOT translated here: it is virtualized, and its
    // offset is owned by the render (`gutterWindow` returns the window's
    // scroll-adjusted `offsetY`). Translating it as well would double-count the
    // scroll and slide that window straight out of the clipped box.
    // Every programmatic scroll (go-to-line, reveal, find-jump) funnels through
    // here, so requesting the viewport publish from this one place keeps the
    // virtualized gutter in sync no matter how the scroll was initiated. It is
    // rAF-coalesced, so a burst of scroll events costs one commit per frame.
    scheduleViewportRef.current();
  }, []);

  // Report the caret to the parent (status bar) whenever it moves.
  useEffect(() => {
    onCursorChange?.({ line: cursor.line + 1, col: cursor.col + 1, sel: cursor.sel });
  }, [cursor.line, cursor.col, cursor.sel, onCursorChange]);

  /* ── Highlight-layer cost control ──────────────────────────────────────
     The <pre> mirror is written with dangerouslySetInnerHTML, so every update
     makes the browser re-parse the markup as HTML.

     Measured: tokenizing a 6k-line / 323 KB buffer costs ~19 ms and emits ~21k
     <span> elements (~0.92 MB). Typing invalidates the highlight cache on every
     keystroke (each key yields a new string, so every cache key is unique), so
     that entire cost — tokenize plus DOM rebuild — used to land on the critical
     path of every single key press. That is a full 60 fps frame in JS alone.

     Fixing it means never tokenizing the whole buffer. Only the tile of lines
     containing the viewport is tokenized; the rest is emitted as escaped plain
     text, so the cost is O(viewport) instead of O(file). The tile is quantised,
     which also means scrolling inside a tile produces an IDENTICAL markup string
     and React skips the DOM write entirely.

     The text is never altered by this — only the colouring — so the mirror stays
     pixel-aligned with the textarea. */
  const firstVisibleLine = Math.max(
    0,
    Math.floor((viewport.scrollTop - PAD_TOP) / LINE_HEIGHT)
  );
  const highlightHtml = useMemo(
    () => highlightWindow(activeContent, activeLang, firstVisibleLine),
    [activeContent, activeLang, firstVisibleLine]
  );
  const gutterDigits = Math.max(2, String(lineCount).length);

  /* ── Inline diagnostics ───────────────────────────────────────────────────
     Findings for the active file come from the shared diagnostics store (tsc +
     structural scan + every language server). They are painted as overlay marks
     on the visible window only — the same layer and arithmetic the find-marks
     use — so nothing here scales with buffer size. */
  const fileDiagnostics = useFileDiagnostics(activePath);
  const diagIndex = useMemo(
    () => indexFileDiagnostics(fileDiagnostics, lineCount),
    [fileDiagnostics, lineCount]
  );
  const lastVisibleLine =
    firstVisibleLine + Math.ceil(viewport.h / LINE_HEIGHT) + 2;
  const diagMarks = useMemo(() => {
    // Squiggles are positioned per logical line, which is only true when each
    // line is a single visual row — with soft wrap the mapping diverges, so the
    // gutter marker and the Problems panel carry the signal instead.
    if (WORD_WRAP) return [];
    const texts = visibleLineTexts(activeContent, firstVisibleLine, lastVisibleLine);
    return layoutDiagnosticMarks(diagIndex.byLine, texts, firstVisibleLine, {
      padTop: PAD_TOP,
      leftPad: MARK_LEFT_PAD,
      charW: FONT_SIZE * 0.6,
      lineHeight: LINE_HEIGHT,
    });
  }, [
    diagIndex,
    activeContent,
    firstVisibleLine,
    lastVisibleLine,
    WORD_WRAP,
    FONT_SIZE,
    LINE_HEIGHT,
  ]);

  // Reset scroll + cursor bookkeeping whenever the user switches tabs. The
  // state half of the reset happens during render (the sanctioned alternative
  // to a setState-in-effect); the DOM half stays in the effect below.
  const [prevActivePath, setPrevActivePath] = useState(activePath);
  if (activePath !== prevActivePath) {
    setPrevActivePath(activePath);
    setFindOpen(false);
    setGoToOpen(false);
    setCtxMenu(null);
    setCursor({ line: 1, col: 1, sel: 0 });
  }

  /* ── Undo timeline seeding ───────────────────────────────────────────────
    The timeline is per file, and the buffer on screen is the one source of
    truth for "where we are". So re-seed whenever the on-screen text no longer
    matches the timeline's current state — that covers both switching to a tab
    for the first time and a file being rewritten underneath us by the agent or
    an external tool. Re-seeding (rather than appending) is what stops undo from
    walking backwards through text the user never actually typed. */
  useEffect(() => {
    if (!active) return;
    const history = historyFor(active.path);
    const current = history.current();
    if (current && current.content === active.content) return;
    // Only the active file can carry a stale buffer, and its caret is live.
    const el = taRef.current;
    const sameBuffer = current !== null && el?.value === active.content;
    resetHistory(active.path, {
      content: active.content,
      selStart: sameBuffer && el ? el.selectionStart : 0,
      selEnd: sameBuffer && el ? el.selectionEnd : 0,
    });
  }, [active]);

  // Every visual layer (textarea, highlight <pre>, gutter, overlay) is
  // re-synced on tab switch — otherwise a previously scrolled layer stays
  // offset and the syntax appears shifted relative to the caret.
  useEffect(() => {
    scrollTopRef.current = 0;
    const raf = requestAnimationFrame(() => {
      const el = taRef.current;
      if (el) {
        el.scrollTop = 0;
        el.scrollLeft = 0;
      }
      applyScrollTransforms();
    });
    return () => cancelAnimationFrame(raf);
  }, [activePath, applyScrollTransforms]);

  // Jump to a requested file+line (problems panel / git panel clicks).
  useEffect(() => {
    if (!reveal || !activePath || reveal.path !== activePath) return;
    const el = taRef.current;
    if (!el) return;
    const target = Math.max(0, (reveal.line - 4) * LINE_HEIGHT);
    el.scrollTop = target;
    scrollTopRef.current = el.scrollTop;
    applyScrollTransforms();
    setCursor({ line: reveal.line, col: 1, sel: 0 });
    el.focus();
  }, [reveal, activePath, applyScrollTransforms, LINE_HEIGHT]);

  const syncCursor = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    // Count newlines up to the caret instead of `slice().split()` — the old
    // version copied the whole buffer into a new string and a new array on every
    // keystroke, which is O(file) work per character typed.
    const upto = el.selectionStart;
    const head = el.value;
    let line = 1;
    let lastBreak = -1;
    for (let i = 0; i < upto; i++) {
      if (head.charCodeAt(i) === 10) {
        line++;
        lastBreak = i;
      }
    }
    setCursor({
      line,
      col: upto - lastBreak,
      sel: el.selectionEnd - el.selectionStart,
    });
  }, []);

  // Keep the active-line band and the highlighted gutter row on the cursor's
  // line (imperative updates — the memoized gutter never re-renders here).
  // The band's position is logical-line based, so it is hidden while wrapping
  // (its row cannot represent a wrapped fragment).
  useEffect(() => {
    if (activeBandRef.current) {
      activeBandRef.current.style.top = `${PAD_TOP + (cursor.line - 1) * LINE_HEIGHT}px`;
      activeBandRef.current.style.display = WORD_WRAP ? "none" : "";
    }
  }, [cursor.line, LINE_HEIGHT, lineCount, activePath, WORD_WRAP]);

  // The gutter's active-line highlight is now rendered declaratively via
  // `activeLineForRender` (it has to be, since virtualization remounts rows and
  // would otherwise drop an imperatively-added class).

  // The gutter is virtualized, so scrolling remounts rows and any imperatively
  // added `gutter-active` class is lost with the old nodes. Re-apply it whenever
  // the rendered window moves. Uses the declarative `activeLine` prop instead of
  // DOM surgery so the highlight is correct on the very first paint of a row.
  const activeLineForRender = SHOW_LINE_NUMBERS && !WORD_WRAP ? cursor.line : -1;

  /** The one funnel every text mutation goes through.
   *
   *  Records the pre-edit state, publishes the new buffer, records the post-edit
   *  state, then restores the caret. Centralising this is what makes undo
   *  reliable: previously each edit site rewrote `el.value` on its own, and the
   *  resulting DOM churn is exactly what WebKitGTK's undo manager (and, on the
   *  paths that fell back, Windows' too) reacts to by discarding history.
   *
   *  `caret` is where the caret lands afterwards; omit it to leave it alone.
   *  `typing` marks plain character entry so bursts of it fold into one undo
   *  step — structural edits leave it false and always get their own step. */
  const commitEdit = (
    next: string,
    caret?: number | { start: number; end: number },
    opts?: { typing?: boolean; before?: EditorSnapshot }
  ) => {
    const el = taRef.current;
    if (!el || !active) return;
    const history = historyFor(active.path);
    const before: EditorSnapshot =
      opts?.before ??
      history.current() ?? { content: el.value, selStart: el.selectionStart, selEnd: el.selectionEnd };

    const range =
      caret === undefined
        ? null
        : typeof caret === "number"
          ? { start: caret, end: caret }
          : caret;
    const after: EditorSnapshot = {
      content: next,
      selStart: Math.min(range ? range.start : before.selStart, next.length),
      selEnd: Math.min(range ? range.end : before.selEnd, next.length),
    };

    recordEdit(active.path, before, after, opts?.typing ?? false);
    onChange(active.path, next);

    // The buffer is controlled, so it only takes the new value once React
    // commits — restoring the caret before that would clamp it against the old
    // text. One frame later it is safe.
    if (range) {
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(after.selStart, after.selEnd);
        syncCursor();
      });
    } else {
      syncCursor();
    }
  };

  /* Close a tab and drop its undo timeline. The store is keyed by path, so a
     closed file's history would otherwise sit there for the rest of the session,
     and re-opening it would resurrect a timeline whose "before" text no longer
     has anything to do with what is on disk. */
  const closeTab = useCallback(
    (path: string) => {
      resetFileHistory(path);
      onClose(path);
    },
    [onClose]
  );

  /** Copy `text` to the system clipboard. Resolves false if it could not be done.
   *
   *  The context menu used to call `document.execCommand("copy"/"cut"/"paste")`,
   *  but WebKitGTK — the Linux webview — does not implement those, so right-click
   *  Cut and Paste silently did nothing there while working on Windows. The
   *  async Clipboard API is the cross-platform path; execCommand survives only as
   *  a last resort for contexts where the API is unavailable. */
  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const el = taRef.current;
      if (!el) return false;
      const doc = document as Document & {
        execCommand?: (cmd: string, ui: boolean) => boolean;
      };
      return typeof doc.execCommand === "function" && doc.execCommand("copy", false);
    }
  };

  /** Read the system clipboard, or null when it cannot be read. */
  const readFromClipboard = async (): Promise<string | null> => {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return null;
    }
  };

  /** Context-menu Cut: copy the selection, then delete it as one undo step. */
  const cutSelection = async () => {
    const el = taRef.current;
    if (!el || !active) return;
    setCtxMenu(null);
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start === end) return;
    // Only remove the text once it is safely on the clipboard — deleting without
    // a successful copy would destroy it irrecoverably.
    if (!(await copyToClipboard(el.value.slice(start, end)))) return;
    commitEdit(el.value.slice(0, start) + el.value.slice(end), start);
  };

  /** Context-menu Copy. */
  const copySelection = async () => {
    const el = taRef.current;
    if (!el) return;
    setCtxMenu(null);
    await copyToClipboard(el.value.slice(el.selectionStart, el.selectionEnd));
  };

  /** Context-menu Paste: inserted through the funnel, so it is undoable. */
  const pasteClipboard = async () => {
    const el = taRef.current;
    if (!el || !active) return;
    setCtxMenu(null);
    const text = await readFromClipboard();
    if (text === null) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    el.focus();
    commitEdit(el.value.slice(0, start) + text + el.value.slice(end), start + text.length);
  };

  const replaceRange = (text: string, from: number, to: number) => {
    const el = taRef.current;
    if (!el || !active) return;
    el.focus();
    el.setSelectionRange(from, to);
    commitEdit(el.value.slice(0, from) + text + el.value.slice(to), from + text.length);
  };

  /** Put a history state on screen: new buffer plus the caret it was left with. */
  const applyHistoryState = useCallback((path: string, snapshot: EditorSnapshot) => {
    const el = taRef.current;
    if (!el || active?.path !== path) return;
    onChange(path, snapshot.content);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(snapshot.selStart, snapshot.selEnd);
      // An undo can land the caret thousands of lines from where it was, so pull
      // it back on screen instead of leaving it scrolled out of the viewport.
      let line = 1;
      for (let i = 0; i < snapshot.selStart; i++) {
        if (snapshot.content.charCodeAt(i) === 10) line++;
      }
      const rowTop = PAD_TOP + (line - 1) * LINE_HEIGHT;
      const firstRow = el.scrollTop + PAD_TOP;
      const lastRow = el.scrollTop + el.clientHeight - LINE_HEIGHT;
      if (rowTop < firstRow) el.scrollTop = Math.max(0, rowTop - PAD_TOP);
      else if (rowTop > lastRow) el.scrollTop = rowTop - el.clientHeight + LINE_HEIGHT * 2;
      scrollTopRef.current = el.scrollTop;
      applyScrollTransforms();
      syncCursor();
    });
  }, [active?.path, onChange, LINE_HEIGHT, applyScrollTransforms, syncCursor]);

  /* Publish the apply function so the Edit menu drives the very same code path
     as Ctrl+Z. Re-registering on every tab switch would briefly leave the menu
     without a presenter, so the deps are kept to the things that genuinely
     change the DOM work this does. */
  useEffect(() => setHistoryPresenter(applyHistoryState), [applyHistoryState]);

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (!active) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      onSave(active.path);
      return;
    }

    const el = e.currentTarget;

    // Undo / redo — Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y.
    //
    // Handled here rather than left to the webview because the native textarea
    // stack is not dependable in either direction: WebKitGTK drops it whenever
    // React writes `value` (every keystroke), and the structural edits below
    // rewrite the buffer wholesale. Driving our own timeline (editorHistory.ts)
    // makes the same keys do the same thing on Linux and Windows, and it is also
    // the only path that can undo a Tab/Enter/comment-toggle as one step.
    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase();
      if (key === "z" && !e.altKey) {
        e.preventDefault();
        if (e.shiftKey) redoHistory(active.path);
        else undoHistory(active.path);
        return;
      }
      if (key === "y" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        redoHistory(active.path);
        return;
      }
    }

    // Ctrl+F: open find/replace.
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      if (findOpen) {
        setFindQuery(el.value.slice(el.selectionStart, el.selectionEnd));
      } else {
        openFind();
      }
      return;
    }
    // Ctrl+G: go to line.
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "g") {
      e.preventDefault();
      setGoToOpen(true);
      setGoToInput(String(cursor.line));
      return;
    }
    // Ctrl+Shift+K: delete line(s).
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      deleteLines(e);
      return;
    }
    // Ctrl+Shift+D: duplicate line(s).
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "d") {
      e.preventDefault();
      duplicateLines(e);
      return;
    }
    // Alt+Arrow: move line up/down.
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveLines(e, 1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveLines(e, -1);
        return;
      }
    }

    // Ctrl+/: toggle line comments on the selected lines.
    if ((e.ctrlKey || e.metaKey) && e.key === "/") {
      const token = commentToken(activeLang);
      if (!token) return;
      e.preventDefault();
      const s = el.selectionStart;
      const en = el.selectionEnd;
      const firstLine = el.value.lastIndexOf("\n", s - 1) + 1;
      let lastLine = el.value.indexOf("\n", en);
      if (lastLine === -1) lastLine = el.value.length;
      const block = el.value.slice(firstLine, lastLine);
      const lines = block.split("\n");
      const allCommented = lines
        .filter((l) => l.trim())
        .every((l) => l.trimStart().startsWith(token));
      const next = lines
        .map((line) => {
          if (!line.trim()) return line;
          if (allCommented) {
            const idx = line.indexOf(token);
            return line.slice(0, idx) + line.slice(idx + token.length).replace(/^ /, "");
          }
          const indent = (/^[ \t]*/.exec(line) ?? [""])[0];
          return `${indent}${token} ${line.slice(indent.length)}`;
        })
        .join("\n");
      replaceRange(next, firstLine, lastLine);
      return;
    }

    // Auto-close brackets & quotes; type-over when the closer is already there.
    const CLOSERS = ")]}\"'`";
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
      const PAIRS: Record<string, string> = {
        "(": ")", "[": "]", "{": "}", '"': '"', "'": "'", "`": "`",
      };
      const open = PAIRS[e.key];
      const s = el.selectionStart;
      const en = el.selectionEnd;
      if (open) {
        // Type-over a closing quote instead of inserting another one.
        if (s === en && open === e.key && el.value[s] === e.key) {
          e.preventDefault();
          el.setSelectionRange(s + 1, s + 1);
          syncCursor();
          return;
        }
        e.preventDefault();
        replaceRange(e.key + open, s, en);
        return;
      }
      if (CLOSERS.includes(e.key) && s === en && el.value[s] === e.key) {
        e.preventDefault();
        el.setSelectionRange(s + 1, s + 1);
        syncCursor();
        return;
      }
      // Backspace between an empty pair deletes both halves.
      if (e.key === "Backspace" && s === en && s > 0) {
        const before = el.value[s - 1];
        const after = el.value[s];
        if (PAIRS[before] && PAIRS[before] === after) {
          e.preventDefault();
          replaceRange("", s - 1, s + 1);
          return;
        }
      }
    }

    // Tab / Shift+Tab: indent & outdent like a real editor.
    if (e.key === "Tab") {
      e.preventDefault();
      const s = el.selectionStart;
      const en = el.selectionEnd;
      if (e.shiftKey) {
        const lineStart = el.value.lastIndexOf("\n", s - 1) + 1;
        const m = new RegExp(`^( {1,${TAB_SIZE}}|\\t)`).exec(el.value.slice(lineStart));
        if (m) replaceRange("", lineStart, lineStart + m[0].length);
      } else if (s !== en) {
        const lineStart = el.value.lastIndexOf("\n", s - 1) + 1;
        const chunk = el.value.slice(lineStart, en);
        replaceRange(chunk.replace(/^/gm, indentUnit), lineStart, en);
      } else {
        replaceRange(indentUnit, s, en);
      }
      return;
    }

    // Enter: keep the current indentation, +1 level after opening brackets.
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const s = el.selectionStart;
      const lineStart = el.value.lastIndexOf("\n", s - 1) + 1;
      const indent = (/^[ \t]*/.exec(el.value.slice(lineStart, s)) ?? [""])[0];
      const prevCh = s > 0 ? el.value[s - 1] : "";
      const extra = "{[(:>".includes(prevCh) ? indentUnit : "";
      replaceRange(`\n${indent}${extra}`, s, el.selectionEnd);
      return;
    }
  };

  const handleScroll = (e: ReactUIEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    scrollTopRef.current = el.scrollTop;
    // Also publishes the viewport, which is what drives the virtualized gutter.
    applyScrollTransforms();
  };

  // Find & replace: match offsets for the current query.
  const matches = computeMatches(activeContent, findQuery, caseSensitive);

  /** Recompute matches for a query imperatively and jump to the first hit.
   *  Done in the callers rather than an effect so the bar never flashes a
   *  stale match index and no state is written from an effect body. */
  const jumpToFirstMatch = (query: string, cs: boolean) => {
    const el = taRef.current;
    const found = computeMatches(activeContent, query, cs);
    if (!el || found.length === 0) {
      setMatchIndex(-1);
      return;
    }
    const m = found[0];
    setMatchIndex(0);
    el.focus();
    el.setSelectionRange(m.start, m.end);
    const { line } = offsetToLineCol(activeContent, m.start);
    el.scrollTop = Math.max(0, (line - 2) * LINE_HEIGHT);
    scrollTopRef.current = el.scrollTop;
    applyScrollTransforms();
  };

  // Monospace-positioned highlight marks for every match (only when not wrapping;
  // the active match is also selected in the textarea, which always works).
  const findMarks = collectFindMarks(
    findOpen && findQuery !== "" && !WORD_WRAP,
    matches,
    activeContent,
    FONT_SIZE * 0.6,
    LINE_HEIGHT
  );

  /** Jump the caret to a specific match index (wraps). */
  const goMatch = (idx: number) => {
    const el = taRef.current;
    if (!el || matches.length === 0) return;
    const real = ((idx % matches.length) + matches.length) % matches.length;
    const m = matches[real];
    setMatchIndex(real);
    el.focus();
    el.setSelectionRange(m.start, m.end);
    const { line } = offsetToLineCol(activeContent, m.start);
    const top = Math.max(0, (line - 2) * LINE_HEIGHT);
    el.scrollTop = top;
    scrollTopRef.current = el.scrollTop;
    applyScrollTransforms();
    syncCursor();
  };

  /** Replace the current match, then move to the next one. */
  const replaceCurrent = () => {
    if (!active || matches.length === 0) return;
    const real = ((matchIndex + matches.length) % matches.length) % matches.length;
    const m = matches[real];
    const next = activeContent.slice(0, m.start) + replaceQuery + activeContent.slice(m.end);
    commitEdit(next, m.start + replaceQuery.length);
    const nextIdx = (real + 1) % matches.length;
    requestAnimationFrame(() => {
      setMatchIndex(nextIdx);
      void Promise.resolve().then(() => goMatch(nextIdx));
    });
  };

  /** Replace every match in the file in one pass. */
  const replaceAll = () => {
    if (!active || matches.length === 0) return;
    let out = "";
    let last = 0;
    for (const m of matches) {
      out += activeContent.slice(last, m.start) + replaceQuery;
      last = m.end;
    }
    out += activeContent.slice(last);
    commitEdit(out, { start: 0, end: 0 });
    setFindQuery("");
    setMatchIndex(-1);
  };

  /** Open the find bar, seeding with the current selection if any. */
  const openFind = () => {
    const el = taRef.current;
    if (!el) return;
    const seed = el.value.slice(el.selectionStart, el.selectionEnd);
    setFindOpen(true);
    setFindQuery(seed);
    setMatchIndex(-1);
    if (seed) jumpToFirstMatch(seed, caseSensitive);
  };

  const findOpenRef = useRef(false);
  useEffect(() => {
    findOpenRef.current = findOpen;
  }, [findOpen]);

  const crumbs = active ? pathSegments(active.path) : [];
  const visibleCrumbs = crumbs.length > 4 ? ["…", ...crumbs.slice(-3)] : crumbs;

  /** Jump the caret to a specific line (1-based). */
  const goToLine = (lineRaw: number) => {
    const el = taRef.current;
    if (!el) return;
    const n = el.value.split("\n").length;
    const target = Math.max(1, Math.min(n, Math.floor(lineRaw)));
    let pos = 0;
    for (let i = 0; i < target - 1; i++) pos = el.value.indexOf("\n", pos) + 1;
    if (pos === 0 && target > 1) pos = el.value.length;
    el.focus();
    el.setSelectionRange(pos, pos);
    el.scrollTop = Math.max(0, (target - 3) * LINE_HEIGHT);
    scrollTopRef.current = el.scrollTop;
    applyScrollTransforms();
    setCursor({ line: target, col: 1, sel: 0 });
  };

  /** Delete the current line(s) — Ctrl+Shift+K. */
  const deleteLines = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const s = el.selectionStart;
    const en = el.selectionEnd;
    const firstLine = el.value.lastIndexOf("\n", s - 1) + 1;
    let lastLine = el.value.indexOf("\n", en);
    if (lastLine === -1) lastLine = el.value.length;
    const next = el.value.slice(0, firstLine) + el.value.slice(lastLine);
    commitEdit(next, Math.min(firstLine, next.length));
  };

  /** Duplicate the current line below — Ctrl+Shift+D. */
  const duplicateLines = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const s = el.selectionStart;
    const en = el.selectionEnd;
    const firstLine = el.value.lastIndexOf("\n", s - 1) + 1;
    let lastLine = el.value.indexOf("\n", en);
    if (lastLine === -1) lastLine = el.value.length;
    const block = el.value.slice(firstLine, lastLine);
    const nl = el.value.slice(lastLine).startsWith("\n") ? "" : "\n";
    const next = el.value.slice(0, lastLine) + nl + block + el.value.slice(lastLine);
    commitEdit(next, lastLine + nl.length + block.length);
  };

  /** Move the current line up/down — Alt+Arrow. */
  const moveLines = (e: ReactKeyboardEvent<HTMLTextAreaElement>, dir: 1 | -1) => {
    const el = e.currentTarget;
    const s = el.selectionStart;
    const caretLine = offsetToLineCol(el.value, s).line;
    const target = caretLine + dir;
    if (target < 0 || target >= el.value.split("\n").length) return;
    const lines = el.value.split("\n");
    const tmp = lines[caretLine];
    lines[caretLine] = lines[target];
    lines[target] = tmp;
    const next = lines.join("\n");
    const newLine = caretLine + dir;
    let pos = 0;
    for (let i = 0; i < newLine; i++) pos = next.indexOf("\n", pos) + 1;
    commitEdit(next, pos);
    // Alt+Arrow moves the caret a whole line, so keep it on screen.
    requestAnimationFrame(() => {
      el.scrollTop = Math.max(0, (newLine - 2) * LINE_HEIGHT);
      scrollTopRef.current = el.scrollTop;
      applyScrollTransforms();
    });
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--bg-editor)]">
      {/* ── Tab strip (VS Code Dark Modern: flat tabs on chrome) */}
      <div className="flex h-[35px] shrink-0 items-stretch border-b border-(--border) bg-[var(--bg-chrome)]">
        <div className="scrollbar-none flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden">
          {tabs.length === 0 && (
            <div className="flex items-center px-3 text-[11.5px] text-[var(--text-faint)]">
              No files open
            </div>
          )}
          {tabs.map((t) => {
            const selected = t.path === activePath;
            return (
              <div
                key={t.path}
                onAuxClick={(ev) => {
                  if (ev.button === 1) closeTab(t.path);
                }}
                className={`group relative flex shrink-0 items-stretch transition-colors ${
                  selected
                    ? "bg-[var(--bg-editor)] text-[var(--text-primary)]"
                    : "bg-transparent text-[var(--text-muted)] hover:bg-(--fill-1) hover:text-[var(--text-primary)]"
                }`}
              >
                {selected && (
                  <>
                    <span className="absolute inset-x-0 top-0 h-[2px] bg-(--accent)" />
                    {/* Merge the active tab into the editor surface (VS Code-style). */}
                    <span className="absolute inset-x-0 -bottom-px h-px bg-[var(--bg-editor)]" />
                  </>
                )}
                <button
                  type="button"
                  onClick={() => onSelect(t.path)}
                  className="flex max-w-[190px] items-center gap-2 py-0 pl-3 pr-1 text-[12px]"
                  title={t.path}
                >
                  <FileIcon name={t.path} />
                  <span className="truncate">{fileName(t.path)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => closeTab(t.path)}
                  aria-label={`Close ${fileName(t.path)}`}
                  className="mr-1.5 flex h-5 w-5 shrink-0 self-center items-center justify-center rounded transition"
                >
                  {t.dirty ? (
                    <>
                      <span className="h-[7px] w-[7px] rounded-full bg-[var(--text-secondary)] group-hover:hidden" />
                      <IoClose className="hidden h-3 w-3 group-hover:block" />
                    </>
                  ) : (
                    <IoClose className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-70" />
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Tab strip actions */}
        <div className="flex shrink-0 items-center gap-0.5 px-1.5">
          {tabs.length > 0 && onCloseAll && (
            <button
              type="button"
              onClick={onCloseAll}
              title="Close all tabs"
              aria-label="Close all tabs"
              className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition hover:bg-(--fill-2) hover:text-[var(--text-primary)]"
            >
              <IoTrashOutline className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {active ? (
        <>
          {/* ── Breadcrumbs ─────────────────────────────────────── */}
          <div className="flex h-7 shrink-0 items-center gap-1.5 overflow-hidden px-3 text-[11px] text-[var(--text-faint)]">
            <FileIcon name={active.path} />
            {visibleCrumbs.map((seg, i) => (
              <span key={`${seg}-${i}`} className="flex items-center gap-1.5 whitespace-nowrap">
                {i > 0 && (
                  <IoChevronForward className="h-2.5 w-2.5 text-[var(--text-faint)]" />
                )}
                <span className={i === visibleCrumbs.length - 1 ? "font-medium text-(--accent)" : "text-[var(--text-muted)]"}>
                  {seg}
                </span>
              </span>
            ))}
          </div>

          {/* ── Find / Replace bar ──────────────────────────────── */}
          {findOpen && findQuery !== null && (
            <FindReplaceBar
              query={findQuery}
              replaceQuery={replaceQuery}
              caseSensitive={caseSensitive}
              replaceMode={replaceMode}
              matchCount={matches.length}
              matchIndex={matchIndex}
              onChangeQuery={(q) => {
                setFindQuery(q);
                jumpToFirstMatch(q, caseSensitive);
              }}
              onChangeReplace={setReplaceQuery}
              onCaseSensitive={(cs) => {
                setCaseSensitive(cs);
                jumpToFirstMatch(findQuery, cs);
              }}
              onNext={() => goMatch(matchIndex + 1)}
              onPrev={() => goMatch(matchIndex - 1)}
              onReplace={replaceCurrent}
              onReplaceAll={replaceAll}
              onToggleReplace={setReplaceMode}
              onClose={() => { setFindOpen(false); setFindQuery(""); setMatchIndex(-1); }}
            />
          )}

          {/* ── Go to line ──────────────────────────────────────── */}
          {goToOpen && (
            <div className="shrink-0 border-b border-(--border) bg-[var(--bg-elevated)] px-3 py-1.5">
              <div className="flex items-center gap-2">
                <form
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    const n = parseInt(goToInput, 10);
                    if (!Number.isNaN(n)) goToLine(n);
                    setGoToOpen(false);
                  }}
                  className="flex flex-1 items-center gap-2"
                >
                  <span className="text-[var(--text-faint)]">
                    <IoCodeSlashOutline size={11} />
                  </span>
                  <span className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Line</span>
                  <input
                    autoFocus
                    value={goToInput}
                    onChange={(ev) => setGoToInput(ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Escape") { ev.stopPropagation(); setGoToOpen(false); }
                    }}
                    pattern="[0-9]*"
                    inputMode="numeric"
                    spellCheck={false}
                    className="w-20 rounded-md border border-(--border) bg-(--fill-1) px-2 py-1 text-[12px] text-[var(--text-primary)] outline-none transition-colors focus:border-(--accent)"
                  />
                  <span className="text-[11px] text-[var(--text-muted)]">of {lineCount}</span>
                </form>
                <button
                  type="button"
                  onClick={() => setGoToOpen(false)}
                  title="Close"
                  className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition hover:bg-(--fill-2) hover:text-[var(--text-primary)]"
                >
                  <IoClose size={11} />
                </button>
              </div>
            </div>
          )}

          {/* ── Editor surface ──────────────────────────────────── */}
          <div className="flex min-h-0 flex-1">
            {/* Line-number gutter — hidden while wrapping: numbers follow
                logical lines but wrapped rows are visual rows, so showing them
                would actively mislabel lines. */}
            {SHOW_LINE_NUMBERS && !WORD_WRAP && (
              <LineNumberGutter
                lineCount={lineCount}
                worstByLine={diagIndex.worst}
                width={gutterDigits * FONT_SIZE * 0.62 + 28}
                fontSize={FONT_SIZE}
                lineHeight={LINE_HEIGHT}
                padTop={PAD_TOP}
                innerRef={gutterInnerRef}
                scrollTop={viewport.scrollTop}
                viewportH={viewport.h}
                activeLine={activeLineForRender}
              />
            )}

            {/* Code area: highlight layer under a transparent textarea */}
            <div className="relative min-w-0 flex-1 overflow-hidden font-mono" style={{ fontSize: FONT_SIZE }}>
              {/* Active-line band + find-match marks share one scroll-translated
                  layer so they can never desync from the caret. */}
              <div
                ref={overlayRef}
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ transform: "translateY(0px)", willChange: "transform" }}
              >
                <div
                  ref={activeBandRef}
                  className="absolute inset-x-0 bg-(--fill-1)"
                  style={{ top: PAD_TOP, height: LINE_HEIGHT }}
                />
                {findMarks.map((mk, i) => (
                  <span
                    key={mk.key}
                    className={`absolute rounded-[2px] ${i === matchIndex ? "bg-(--accent)/40" : "bg-(--accent)/20"}`}
                    style={{ top: mk.top, left: mk.left, width: mk.width, height: LINE_HEIGHT }}
                  />
                ))}
                {/* Diagnostic squiggles — a wavy bar under the flagged span.
                    pointer-events re-enabled so hovering the underline shows the
                    message (the layer itself is pointer-events-none). */}
                {diagMarks.map((m) => (
                  <span
                    key={m.key}
                    title={diagnosticTooltip(m)}
                    className="pointer-events-auto absolute"
                    style={{
                      top: m.top + m.height - 3,
                      left: m.left,
                      width: m.width,
                      height: 2,
                      backgroundImage: `repeating-linear-gradient(90deg, ${DIAG_COLOR[m.severity]} 0 4px, transparent 4px 8px)`,
                      opacity: 0.9,
                    }}
                  />
                ))}
              </div>
              <pre
                ref={preRef}
                aria-hidden
                className={`pointer-events-none absolute inset-0 m-0 overflow-hidden pb-20 pl-4 pr-10 text-[var(--text-primary)] ${
                  WORD_WRAP ? "whitespace-pre-wrap" : "whitespace-pre"
                }`}
                style={{
                  paddingTop: PAD_TOP,
                  lineHeight: `${LINE_HEIGHT}px`,
                  tabSize: TAB_SIZE,
                  // Match the <textarea>'s eager soft-wrap breaking exactly:
                  // both layers now break long tokens anywhere and reserve the
                  // same scrollbar gutter width, so wrap points (and therefore
                  // line positions) can never diverge.
                  overflowWrap: "anywhere",
                  scrollbarGutter: "stable",
                }}
                dangerouslySetInnerHTML={{ __html: highlightHtml }}
              />
              <textarea
                ref={taRef}
                value={active.content}
                onChange={(e) => {
                  // Plain character entry. The browser has already committed the
                  // new text to the DOM, so the pre-edit state has to come from
                  // the timeline rather than from `el.value` — which is already
                  // post-edit here. Marked as typing so a burst of keystrokes
                  // collapses into a single undo step.
                  const el = e.target;
                  // A single-character insert or delete is typing. Anything else —
                  // a paste, a drop, an IME commit — is a structural edit and gets
                  // its own undo step instead of folding into the typing run.
                  // Abs(1) rather than == 1 so holding Backspace undoes as one
                  // step, the way it behaves in every other editor.
                  const isTyping = Math.abs(el.value.length - active.content.length) === 1;
                  commitEdit(el.value, { start: el.selectionStart, end: el.selectionEnd }, {
                    typing: isTyping,
                    before: historyFor(active.path).current() ?? {
                      content: active.content,
                      selStart: el.selectionStart,
                      selEnd: el.selectionEnd,
                    },
                  });
                }}
                onKeyDown={handleKeyDown}
                onScroll={handleScroll}
                onClick={syncCursor}
                onKeyUp={syncCursor}
                onContextMenu={(ev) => {
                  ev.preventDefault();
                  setCtxMenu({ x: ev.clientX, y: ev.clientY });
                }}
                onSelect={syncCursor}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                wrap={WORD_WRAP ? "soft" : "off"}
                className={`absolute inset-0 resize-none overflow-auto bg-transparent pb-20 pl-4 pr-10 text-transparent caret-(--accent) outline-none selection:bg-(--accent)/25 ${
                  WORD_WRAP ? "whitespace-pre-wrap" : "whitespace-pre"
                }`}
                style={{
                  paddingTop: PAD_TOP,
                  lineHeight: `${LINE_HEIGHT}px`,
                  tabSize: TAB_SIZE,
                  // Force the same breaking rules as the highlight layer above
                  // and reserve the scrollbar gutter on both, so soft-wrapped
                  // rows stay pixel-identical (no more caret-on-the-wrong-line).
                  overflowWrap: "anywhere",
                  scrollbarGutter: "stable",
                }}
              />
            </div>
          </div>
        </>
      ) : (
        /*Empty state */
        <div className="relative flex flex-1 items-center justify-center px-6">
          <div className="msg-in flex w-full max-w-[260px] flex-col items-center text-center">
           <TextType 
              text={["Open a new folder/file to start", "No file open", "Empty"]}
              typingSpeed={112}
              pauseDuration={1500}
              showCursor
              cursorCharacter="_"
              deletingSpeed={80}
              variableSpeed={{ min: 60, max: 120 }}
              cursorBlinkDuration={0.8}
            />
          {/* <p className="mt-4 text-[13px] font-medium text-[var(--text-primary)]">No file open</p> 
            <p className="mt-1 text-[11px] leading-5 text-[var(--text-muted)]">
              Open a file to start editing.
            </p> */}
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => emptyState?.onOpenFiles?.()}
                className="rounded-md border border-(--border-strong) px-3 py-1.5 text-[11.5px] text-[var(--text-primary)] transition hover:bg-(--fill-2)"
              >
                Open File
              </button>
              {emptyState?.onOpenFolder && (
                <button
                  type="button"
                  onClick={emptyState.onOpenFolder}
                  className="rounded-md border border-(--border-strong) px-3 py-1.5 text-[11.5px] text-[var(--text-primary)] transition hover:bg-(--fill-2)"
                >
                  Open Folder
                </button>
              )}
            </div>
            {emptyState?.hasWorkspace && emptyState.onCreateFile && (
              <button
                type="button"
                onClick={() => setCreatingFile(true)}
                className="mt-2 text-[11px] text-[var(--text-muted)] underline decoration-(--border-strong) underline-offset-2 transition hover:text-[var(--text-primary)]"
              >
                New file
              </button>
            )}
            {creatingFile && (
              <form
                className="mt-3 w-full"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = newFileName.trim();
                  if (name && emptyState?.onCreateFile) {
                    emptyState.onCreateFile(name);
                    setCreatingFile(false);
                    setNewFileName("");
                  }
                }}
              >
                <input
                  autoFocus
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  onBlur={() => setCreatingFile(false)}
                  onKeyDown={(e) => e.key === "Escape" && setCreatingFile(false)}
                  placeholder="src/main.ts"
                  spellCheck={false}
                  className="w-full rounded-md border border-(--border) bg-(--fill-1) px-2.5 py-1.5 text-center font-mono text-[11.5px] text-[var(--text-primary)] outline-none transition-colors focus:border-(--accent) placeholder:text-[var(--text-faint)]"
                />
              </form>
            )}
            <p className="mt-6 text-[10px] text-[var(--text-faint)]">
              Ctrl+S save · Ctrl+F find · Ctrl+G jump
            </p>
          </div>
        </div>
      )}

      {/* ── Editor context menu (right-click) ─────────────────────── */}
      {ctxMenu && active && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setCtxMenu(null)}
            onContextMenu={(ev) => { ev.preventDefault(); setCtxMenu(null); }}
          />
          <div
            className="panel-in fixed z-50 w-48 overflow-hidden rounded-lg border border-(--border-strong) bg-[var(--bg-elevated)] py-1 shadow-[0_10px_32px_rgba(0,0,0,0.5)]"
            style={{
              left: Math.min(ctxMenu.x, window.innerWidth - 200),
              top: Math.min(ctxMenu.y, window.innerHeight - 260),
            }}
          >
            <button
              type="button"
              onClick={() => void cutSelection()}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] text-[var(--text-primary)] transition hover:bg-(--fill-2) hover:text-[var(--text-primary)]"
            >
              <IoCutOutline size={12} />
              Cut
              <span className="kbd ml-auto">Ctrl+X</span>
            </button>
            <button
              type="button"
              onClick={() => void copySelection()}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] text-[var(--text-primary)] hover:bg-(--fill-2) hover:text-[var(--text-primary)]"
            >
              <IoCopyOutline size={12} />
              Copy
              <span className="kbd ml-auto">Ctrl+C</span>
            </button>
            <button
              type="button"
              onClick={() => void pasteClipboard()}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] text-[var(--text-primary)] hover:bg-(--fill-2) hover:text-[var(--text-primary)]"
            >
              <IoClipboardOutline size={12} />
              Paste
              <span className="kbd ml-auto">Ctrl+V</span>
            </button>
            <div className="my-1 h-px bg-(--fill-2)" />
            <button
              type="button"
              onClick={() => { taRef.current?.select(); setCtxMenu(null); }}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] text-[var(--text-primary)] hover:bg-(--fill-2) hover:text-[var(--text-primary)]"
            >
              <IoListOutline size={12} />
              Select All
              <span className="kbd ml-auto">Ctrl+A</span>
            </button>
            <div className="my-1 h-px bg-(--fill-2)" />
            <button
              type="button"
              onClick={() => { setCtxMenu(null); openFind(); }}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] text-[var(--text-primary)] hover:bg-(--fill-2) hover:text-[var(--text-primary)]"
            >
              <IoSearch size={12} />
              Find…
              <span className="kbd ml-auto">Ctrl+F</span>
            </button>
            <button
              type="button"
              onClick={() => { setCtxMenu(null); setGoToOpen(true); setGoToInput(String(cursor.line)); }}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] text-[var(--text-primary)] hover:bg-(--fill-2) hover:text-[var(--text-primary)]"
            >
              <IoCodeSlashOutline size={12} />
              Go to Line…
              <span className="kbd ml-auto">Ctrl+G</span>
            </button>
          </div>
        </>
      )}
    </section>
  );
});