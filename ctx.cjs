/* Prints code context around every match of a pattern, across many files.
 * Usage: node ctx.cjs "finally" src/App.tsx src/components/GitPanel.tsx
 *        node ctx.cjs "finally" --all      (scans src + components)          */
const fs = require("fs");
const path = require("path");

const pattern = process.argv[2];
const args = process.argv.slice(3);
const before = Number(process.env.B || 3);
const after = Number(process.env.A || 3);

let files = args;
if (args.includes("--all")) {
  files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules") walk(p);
      } else if (/\.tsx?$/.test(e.name)) files.push(p);
    }
  };
  walk("src");
  walk("components");
}

for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!line.includes(pattern)) return;
    console.log(`\n--- ${file}:${i + 1} ---`);
    for (let j = Math.max(0, i - before); j <= Math.min(lines.length - 1, i + after); j++) {
      console.log(String(j + 1).padStart(4) + " | " + lines[j]);
    }
  });
}
