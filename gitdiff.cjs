/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/madhusudhan-rgb/Neo) for more information on permissions to use the code.
 */
const fs = require("fs");
const f = "src/ide/IdeWindowApp.tsx";
const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
let wrote = 0;
for (let i = 0; i < lines.length; i++) {
  const ln = lines[i];
  // Fix indentation of the closeGit/onOpenFile block (lines ~804-806).
  if (/^onClose=\{closeGit\}/.test(ln.trim()) && ln.startsWith("                        ")) {
    lines[i] = "            onClose={closeGit}";
    wrote++;
  }
  if (ln.includes("openFileInEditor") && ln.includes("replace")) {
    lines[i] = "              void openFileInEditor(`${workspaceRoot.replace(/[/\\\\]+$/, \"\")}/${p}`)";
    wrote++;
  }
}
fs.writeFileSync(f, lines.join("\n"));
console.log("lines fixed:", wrote);
