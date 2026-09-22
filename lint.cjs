/* Lint helper: runs ESLint programmatically over the given paths and prints a
 * compact report. Usage: node lint.cjs src/components/CodeEditor.tsx [...]  */
const { ESLint } = require("eslint");

(async () => {
  const eslint = new ESLint({ cwd: process.cwd() });
  const results = await eslint.lintFiles(process.argv.slice(2));
  let total = 0;
  let filesWithProblems = 0;
  if (process.env.VERBOSE) {
    console.log(`scanned ${results.length} file(s)`);
  }
  for (const r of results) {
    if (!r.messages.length) continue;
    filesWithProblems++;
    const rel = r.filePath.replace(/\\/g, "/").replace(/.*AgenticCoder\//, "");
    for (const m of r.messages) {
      total++;
      console.log(
        `${m.severity === 2 ? "ERR" : "WRN"} ${rel}:${m.line}:${m.column} ${m.ruleId || "(parse)"}\n    ${String(m.message).split("\n")[0]}`
      );
      if (m.message.length > 200) {
        console.log("    ..." + m.message.slice(-260).replace(/\n/g, "\n    "));
      }
    }
  }
  console.log(`TOTAL=${total} in ${filesWithProblems} file(s)`);
})();
