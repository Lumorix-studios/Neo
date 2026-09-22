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
