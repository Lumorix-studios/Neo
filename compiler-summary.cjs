/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/madhusudhan-rgb/Neo) for more information on permissions to use the code.
 */
/* Runs the React Compiler over every source file and summarises which
 * components still bail out of auto-memoization, grouped by bailout kind.
 * Usage: node compiler-summary.cjs                                        */
const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");
const compiler = require("babel-plugin-react-compiler");

const roots = ["src", "components"];
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules") continue;
      walk(p);
    } else if (/\.tsx?$/.test(e.name)) files.push(p);
  }
})(roots[0]);
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name)) files.push(p);
  }
})(roots[1]);

const ok = [];
const bad = [];
const kinds = new Map();

for (const file of files) {
  const code = fs.readFileSync(file, "utf8");
  try {
    babel.transformSync(code, {
      filename: file,
      babelrc: false,
      configFile: false,
      parserOpts: { plugins: ["jsx", "typescript"], sourceType: "module" },
      plugins: [[compiler, { panicThreshold: "ALL_ERRORS" }]],
    });
    ok.push(file);
  } catch (e) {
    const msg = String(e.message);
    const found = new Set();
    for (const m of msg.matchAll(/Todo: ([^\n]+)/g)) {
      const kind = m[1].replace(/ @line .*/, "").trim();
      found.add(kind);
      const arr = kinds.get(kind) || [];
      for (const l of m[0].match(/\d+/g) || []) arr.push(`${file}:${l}`);
      kinds.set(kind, arr);
    }
    bad.push({ file, kinds: [...found] });
  }
}

console.log(`=== OK (auto-memoized): ${ok.length} file(s)`);
for (const f of ok) console.log("  " + f);
console.log(`\n=== SKIPPED: ${bad.length} file(s)`);
for (const b of bad) {
  console.log("  " + b.file);
  for (const k of b.kinds) console.log("      - " + k);
}
console.log("\n=== BAILOUT KINDS (by frequency)");
for (const [k, lines] of [...kinds].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${lines.length}x  ${k}`);
}
