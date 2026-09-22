/* Audit every component in the project. Usage: node audit-all.cjs */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const roots = ["src", "components"];
const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name)) files.push(p.replace(/\\/g, "/"));
  }
};
for (const r of roots) walk(r);

try {
  const out = execFileSync(process.execPath, ["compiler-audit.cjs", ...files], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  process.stdout.write(out);
} catch (e) {
  process.stdout.write(e.stdout || "");
}
