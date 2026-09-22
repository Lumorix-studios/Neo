/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/madhusudhan-rgb/Neo) for more information on permissions to use the code.
 */
const r = require("./eslint.json");
const filter = process.argv[2];
let n = 0;
for (const f of r) {
  if (filter && !f.filePath.includes(filter)) continue;
  for (const m of f.messages) {
    n++;
    const p = f.filePath.split("AgenticCoder")[1];
    const sev = m.severity === 2 ? "ERR " : "warn";
    console.log(sev + " " + p + " " + m.line + ":" + m.column + " [" + m.ruleId + "]");
  }
}
console.log("TOTAL=" + n);
