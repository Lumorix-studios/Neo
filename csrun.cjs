/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/madhusudhan-rgb/Neo) for more information on permissions to use the code.
 */
/* Convenience runner: invokes compiler-summary.cjs and prints the totals. */
const { execFileSync } = require("child_process");
const out = execFileSync(process.execPath, ["compiler-summary.cjs"], {
  cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
}).stdout;
process.stdout.write(out);
