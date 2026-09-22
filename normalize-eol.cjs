/* Normalises mixed CRLF/LF line endings to plain LF across source files.
 * Mixed endings break multi-line tooling (editors, diff hunks) and were
 * introduced piecemeal. Batch/PowerShell files are skipped on purpose since
 * cmd.exe label parsing is sensitive to the line terminator.
 *
 * Usage: node normalize-eol.cjs [--check]                                    */
const fs = require("fs");
const path = require("path");

const CHECK = process.argv.includes("--check");
const EXT = new Set([".ts", ".tsx", ".js", ".cjs", ".mjs", ".css", ".rs", ".sql", ".json", ".md"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "target", "dist", "gen"]);

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(path.join(dir, e.name));
    } else if (EXT.has(path.extname(e.name))) {
      files.push(path.join(dir, e.name));
    }
  }
})(".");

let changed = 0;
for (const file of files) {
  const raw = fs.readFileSync(file, "utf8");
  if (!raw.includes("\r")) continue;
  const fixed = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  console.log((CHECK ? "would fix " : "fixed     ") + file);
  if (!CHECK) fs.writeFileSync(file, fixed, "utf8");
  changed++;
}
console.log(`\n${changed} file(s) ${CHECK ? "need" : "got"} normalised (scanned ${files.length}).`);
