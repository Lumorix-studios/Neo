/* Runs tsc once and prints only the lines that matter. */
const { execFileSync } = require("child_process");
const fs = require("fs");
const root = process.cwd();
try {
  execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit"], {
    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  console.log("tsc: OK (no errors)");
} catch (e) {
  const out = (e.stdout || "") + (e.stderr || "");
  fs.writeFileSync("tsc-final.txt", out);
  const lines = out.split(/\r?\n/).filter((l) => l.trim());
  console.log("tsc: " + lines.length + " line(s) of output");
  for (const l of lines) console.log(l);
}
