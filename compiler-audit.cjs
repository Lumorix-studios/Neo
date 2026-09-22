/*
 * Compiler audit: runs babel-plugin-react-compiler over the given files with
 * panicThreshold=ALL_ERRORS so *any* bailout ("Compilation Skipped") is thrown
 * instead of being silently ignored. A file that prints OK is guaranteed to be
 * auto-memoized by the React Compiler in the real Vite build.
 *
 * Usage: node compiler-audit.cjs src/components/CodeEditor.tsx [...]
 */
const fs = require("fs");
const babel = require("@babel/core");
const compiler = require("babel-plugin-react-compiler");

const files = process.argv.slice(2);
let failures = 0;

for (const file of files) {
  const code = fs.readFileSync(file, "utf8");
  try {
    babel.transformSync(code, {
      filename: file,
      babelrc: false,
      configFile: false,
      parserOpts: { plugins: ["jsx", "typescript"], sourceType: "module" },
      plugins: [[compiler, { panicThreshold: "ALL_ERRORS" }]],
      compact: false,
    });
    console.log("OK    " + file);
  } catch (e) {
    failures++;
    const blocks = String(e.message).split(/(?=Error: |Todo: )/);
    const kinds = new Map();
    for (const b of blocks) {
      const first = b.trim().split("\n")[0].trim();
      if (!first) continue;
      const loc = (b.match(/^\s*>?\s*(\d+) \|/m) || [])[1] || "";
      const key = first.replace(/^Error: /, "").slice(0, 110);
      if (!kinds.has(key)) kinds.set(key, []);
      if (loc) kinds.get(key).push(loc);
    }
    console.log("SKIP  " + file + "  (" + kinds.size + " kind(s))");
    for (const [k, locs] of kinds) {
      console.log("      " + k + (locs.length ? "  @line " + locs.join(",") : ""));
    }
  }
}
console.log("\nfailures=" + failures);
process.exit(failures ? 1 : 0);
