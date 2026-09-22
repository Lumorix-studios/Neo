/* Groups the ESLint JSON output by file and rule so the remaining problem
 * count is readable at a glance. Usage: node report-problems.cjs */
const r = require("./eslint.json");
let total = 0;
const byRule = new Map();
const byFile = new Map();
for (const f of r) {
  for (const m of f.messages) {
    total++;
    const rule = m.ruleId || "(parse)";
    byRule.set(rule, (byRule.get(rule) || 0) + 1);
    if (!byFile.has(f.filePath)) byFile.set(f.filePath, []);
    byFile.get(f.filePath).push(`${m.severity === 2 ? "ERR" : "WRN"} ${m.line}:${m.column} ${rule}`);
  }
}
console.log("TOTAL=" + total);
console.log("\n== by rule ==");
for (const [k, v] of [...byRule].sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(4) + "  " + k);
console.log("\n== by file ==");
for (const [k, v] of [...byFile].sort((a, b) => b[1].length - a[1].length)) {
  console.log(String(v.length).padStart(4) + "  " + k.replace(/\\/g, "/").replace(/.*AgenticCoder\//, ""));
  for (const x of v) console.log("        " + x);
}
