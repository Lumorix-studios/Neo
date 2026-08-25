/**
 * Minimal line-diff engine used to show file edits as +/- changes,
 * VS Code style, inside the agent activity feed.
 */

export interface DiffLine {
  type: "add" | "del" | "ctx";
  text: string;
}

// Newline char built at runtime so the source stays escape-sequence safe.
const NL = String.fromCharCode(10);

/** Cap for the LCS matrix — larger files fall back to a coarse summary. */
const MAX_LINES = 800;

export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  // Hard cap on input size — pathological inputs must never hang the UI.
  const MAX_CHARS = 200000;
  if (oldText.length > MAX_CHARS || newText.length > MAX_CHARS) {
    return [
      { type: "del", text: `(previous version — ${Math.round(oldText.length / 1024)} KB)` },
      { type: "add", text: `(new version — ${Math.round(newText.length / 1024)} KB)` },
    ];
  }
  const a = oldText.split(NL);
  const b = newText.split(NL);

  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    return [
      { type: "del", text: `(previous version — ${a.length} lines)` },
      { type: "add", text: `(new version — ${b.length} lines)` },
    ];
  }

  // LCS dynamic programming table (bottom-up).
  const n = a.length;
  const m = b.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "ctx", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", text: a[i] });
      i++;
    } else {
      out.push({ type: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ type: "del", text: a[i++] });
  while (j < m) out.push({ type: "add", text: b[j++] });

  // Trim long runs of unchanged context around the edits.
  const CONTEXT = 3;
  const keep = new Array(out.length).fill(false);
  out.forEach((l, idx) => {
    if (l.type !== "ctx") {
      for (let k = Math.max(0, idx - CONTEXT); k <= Math.min(out.length - 1, idx + CONTEXT); k++) {
        keep[k] = true;
      }
    }
  });
  const trimmed: DiffLine[] = [];
  let skipping = false;
  out.forEach((l, idx) => {
    if (!keep[idx]) {
      if (!skipping) {
        trimmed.push({ type: "ctx", text: "…" });
        skipping = true;
      }
      return;
    }
    skipping = false;
    trimmed.push(l);
  });

  return trimmed;
}

/** Summary counts for a diff ("+3 −1"). */
export function diffStats(diff: DiffLine[]): { adds: number; dels: number } {
  let adds = 0;
  let dels = 0;
  for (const l of diff) {
    if (l.type === "add") adds++;
    else if (l.type === "del") dels++;
  }
  return { adds, dels };
}