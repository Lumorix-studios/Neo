/* Edit helper: applies precise line-range replacements when the editor tool's
 * whitespace matching fails. Usage is hard-coded per invocation. */
const fs = require("fs");
const path = "src/components/TerminalView.tsx";
const raw = fs.readFileSync(path, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(/\r?\n/);

const start = 50; // 0-based index of line 51
const end = 64; // exclusive: covers lines 51-64
const replacement = [
  "  /** Seed the terminal options from prefs. An effect event because prefs only",
  "   *  bootstrap the constructor — live changes are applied by the effect below,",
  "   *  so the creation effect must stay keyed on `id` alone. */",
  "  const seedOptions = useEffectEvent(() => ({",
  "    cursorBlink: prefs?.cursorBlink ?? true,",
  "    fontFamily:",
  "      \"ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace\",",
  "    fontSize: prefs?.fontSize ?? 12.5,",
  "    lineHeight: 1.2,",
  "    scrollback: prefs?.scrollback ?? 1000,",
  "    theme: termThemeFromDoc(),",
  "  }));",
  "",
  "  // Create the xterm instance + wire it to the PTY once.",
  "  useEffect(() => {",
  "    const el = containerRef.current;",
  "    if (!el || termRef.current) return;",
  "",
  "    const term = new XTerm(seedOptions());",
];
console.log("replacing lines", start + 1, "to", end, "=>");
console.log(JSON.stringify(lines.slice(start, end), null, 1));
if (process.env.DRY) {
  console.log("DRY RUN — nothing written");
  process.exit(0);
}
lines.splice(start, end - start, ...replacement);
fs.writeFileSync(path, lines.join(eol), "utf8");
console.log("done");
