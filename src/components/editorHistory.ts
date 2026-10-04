/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/Lumorix-studios/Struct) for more information on permissions to use this code.
 */

/**
 * Per-file undo/redo timelines for the code editor.
 *
 * The editor is a controlled <textarea>, which makes the webview's own undo
 * stack unusable and, worse, platform-dependent:
 *
 *   • WebKitGTK (the Linux webview) throws its undo manager away as soon as
 *     `.value` is written programmatically — which React does on every single
 *     keystroke, and which `setSelectionRange` does on every structural edit.
 *   • The editor's structural edits used to prefer `execCommand("insertText")`,
 *     which only Chromium/WebView2 (Windows) honours. Linux always fell through
 *     to the manual `el.value = …` branch that wipes the stack outright.
 *
 * Net effect: undo appeared to work on Windows and did nothing at all on Linux —
 * exactly the platform split we are trying to remove. So the editor owns its
 * history instead of borrowing the browser's: a list of document states plus a
 * cursor into it. Undo and redo only move that cursor; nothing else touches it,
 * so behaviour is identical on every webview.
 *
 * State lives at module scope for the same reason as `logBus.ts`: the Edit menu
 * sits in a different component from the editor, and both must see the same
 * timelines without prop-drilling — and without a React commit on every
 * keystroke just to repaint two menu items.
 */

/** A document state: the buffer plus where the caret was. */
export interface EditorSnapshot {
  content: string;
  selStart: number;
  selEnd: number;
}

/** How many states a single file keeps. */
const MAX_STATES = 200;
/**
 * Total content characters retained per file. Snapshots hold whole buffers, so a
 * generous count alone would pin hundreds of MB on a large file; this caps the
 * retained text and drops the oldest states instead.
 */
const MAX_CHARS = 4_000_000;
/**
 * Consecutive keystrokes closer together than this fold into one undo step, so
 * undo removes the word you just typed rather than one character of it.
 */
const COALESCE_MS = 500;


/** One file's undo stack: an array of states and a cursor into it. */
class FileHistory {
  private states: EditorSnapshot[] = [];
  /** Running total of `states[*].content.length`, so trimming stays O(1). */
  private chars = 0;
  /** Index of the state currently on screen; -1 until the first edit. */
  private index = -1;
  private lastAt = 0;
  private lastWasTyping = false;

  /** The state on screen, or null before the timeline has been seeded. */
  current(): EditorSnapshot | null {
    return this.index >= 0 ? this.states[this.index] : null;
  }

  get canUndo(): boolean {
    return this.index > 0;
  }

  get canRedo(): boolean {
    return this.index >= 0 && this.index < this.states.length - 1;
  }

  /** Discard the timeline and restart from `snap`. */
  reset(snap: EditorSnapshot): void {
    this.states = [snap];
    this.chars = snap.content.length;
    this.index = 0;
    // No coalescing across a reset — the first keystroke after it is its own step.
    this.lastAt = 0;
    this.lastWasTyping = false;
  }

  /**
   * Record one edit. `before` seeds an empty timeline; `after` becomes the new
   * current state. `typing` marks plain character entry, which may fold into the
   * previous step; every structural edit (tab, enter, comment toggle, replace,
   * undo/redo) passes false and always gets a step of its own.
   */
  record(before: EditorSnapshot, after: EditorSnapshot, typing: boolean): void {
    if (this.index < 0) this.reset(before);
    // Before is authoritative for the current state — the <textarea>'s onChange
    // hands us the *new* text (the browser already committed it), so reading the
    // DOM there would seed the timeline with post-edit content.
    //
    // Adopt it unconditionally. Only the length delta feeds the memory budget,
    // but the caret has to be taken from `before` even when the text is
    // identical, which is the common case: skipping that left every seeded
    // state pointing at offset 0, so undo moved the caret to the top of the
    // file instead of back to where the edit started.
    const current = this.states[this.index];
    if (current.content !== before.content) {
      this.chars += before.content.length - current.content.length;
    }
    this.states[this.index] = before;

    const now = Date.now();
    const atTip = this.index === this.states.length - 1;
    const foldsIntoPrevious =
      typing && this.lastWasTyping && atTip && now - this.lastAt < COALESCE_MS;

    if (foldsIntoPrevious) {
      this.chars += after.content.length - this.states[this.index].content.length;
      this.states[this.index] = after;
    } else {
      // Anything typed after an undo discards the redo tail, as everywhere else.
      for (const dropped of this.states.splice(this.index + 1)) {
        this.chars -= dropped.content.length;
      }
      this.states.push(after);
      this.chars += after.content.length;
      this.index = this.states.length - 1;
      this.trim();
    }

    this.lastAt = now;
    this.lastWasTyping = typing;
  }

  undo(): EditorSnapshot | null {
    if (!this.canUndo) return null;
    this.index--;
    this.lastWasTyping = false;
    return this.states[this.index];
  }

  redo(): EditorSnapshot | null {
    if (!this.canRedo) return null;
    this.index++;
    this.lastWasTyping = false;
    return this.states[this.index];
  }

  /** Drop the oldest states until both the count and the memory budget fit. */
  private trim(): void {
    while (
      this.states.length > MAX_STATES ||
      (this.chars > MAX_CHARS && this.states.length > 1)
    ) {
      this.chars -= this.states[0].content.length;
      this.states.shift();
      this.index--;
    }
    if (this.index < 0) this.index = 0;
  }
}


const histories = new Map<string, FileHistory>();
const listeners = new Set<() => void>();

/** The timeline for `path`, created empty on first use. */
export function historyFor(path: string): FileHistory {
  let history = histories.get(path);
  if (!history) {
    history = new FileHistory();
    histories.set(path, history);
  }
  return history;
}

/** Whether the Edit menu should enable Undo / Redo for `path`. */
export function historyAvailability(
  path: string | null
): { canUndo: boolean; canRedo: boolean } {
  const history = path ? histories.get(path) : undefined;
  return {
    canUndo: history?.canUndo ?? false,
    canRedo: history?.canRedo ?? false,
  };
}

/**
 * Last availability pair published per file. Availability is the only thing the
 * Edit menu subscribes to, and it flips exactly twice per editing session
 * (disabled -> enabled on the first edit, and back at the end of the timeline).
 * Comparing against this keeps `notifyHistory` off the keystroke path: a
 * subscriber is woken only when a menu item's enabled state would really change.
 */
const publishedAvailability = new Map<string, string>();

/** Publish the current availability for `path`, but only if it changed. */
function syncAvailability(path: string): void {
  const { canUndo, canRedo } = historyAvailability(path);
  const key = `${canUndo}|${canRedo}`;
  if (publishedAvailability.get(path) === key) return;
  publishedAvailability.set(path, key);
  notifyHistory();
}

/**
 * Record one edit against `path`'s timeline. The editor funnels every mutation
 * through here so the Edit menu hears about the first keystroke (which enables
 * Undo) without being woken on each one after it.
 */
export function recordEdit(
  path: string,
  before: EditorSnapshot,
  after: EditorSnapshot,
  typing: boolean
): void {
  historyFor(path).record(before, after, typing);
  syncAvailability(path);
}

/**
 * The editor owns the <textarea>, so it is the only thing that can put a
 * snapshot back on screen. It registers that here, which lets the Edit menu
 * drive undo/redo by calling the exact same function the Ctrl+Z path calls —
 * one implementation, no chance of the two drifting apart.
 */
type HistoryPresenter = (path: string, snapshot: EditorSnapshot) => void;

let presenter: HistoryPresenter | null = null;

/** Register the editor's "apply this state" function. Returns an unregister. */
export function setHistoryPresenter(fn: HistoryPresenter): () => void {
  presenter = fn;
  return () => {
    if (presenter === fn) presenter = null;
  };
}

/** Step one entry back. Returns the state that was applied, or null at the bottom. */
export function undoHistory(path: string): EditorSnapshot | null {
  const snapshot = histories.get(path)?.undo() ?? null;
  syncAvailability(path);
  if (snapshot) presenter?.(path, snapshot);
  return snapshot;
}

/** Step one entry forward. Returns the state that was applied, or null at the top. */
export function redoHistory(path: string): EditorSnapshot | null {
  const snapshot = histories.get(path)?.redo() ?? null;
  syncAvailability(path);
  if (snapshot) presenter?.(path, snapshot);
  return snapshot;
}

/**
 * Re-seed a file's timeline from what is currently on screen.
 *
 * Used when a tab is opened for the first time and when the buffer is rewritten
 * underneath us (an agent edit, an external tool). Re-seeding rather than
 * appending is what stops undo from walking backwards through text the user
 * never typed. Publishes the new availability so the Edit menu cannot keep
 * offering an Undo that has nothing behind it.
 */
export function resetHistory(path: string, snapshot: EditorSnapshot): void {
  historyFor(path).reset(snapshot);
  syncAvailability(path);
}

/** Forget one file's history — called when its tab closes. */
export function resetFileHistory(path: string): void {
  publishedAvailability.delete(path);
  if (histories.delete(path)) notifyHistory();
}

/** Forget everything — called when the workspace is closed. */
export function clearAllHistories(): void {
  if (histories.size === 0 && publishedAvailability.size === 0) return;
  histories.clear();
  publishedAvailability.clear();
  notifyHistory();
}

/** Subscribe to timeline changes (the Edit menu's enabled state). */
export function subscribeHistory(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyHistory(): void {
  for (const listener of listeners) listener();
}
