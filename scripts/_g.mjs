// Temporary dev helper: node scripts/_g.mjs <file> <regex> [fromLine] [toLine]
import { readFileSync } from "node:fs";
const [, , file, pattern, from, to] = process.argv;
const lines = readFileSync(file, "utf8").split(/\r?\n/);
const re = new RegExp(pattern);
const lo = from ? Number(from) : 1;
const hi = to ? Number(to) : lines.length;
for (let i = lo - 1; i < Math.min(hi, lines.length); i++) {
  if (re.test(lines[i])) console.log(`${i + 1}: ${lines[i]}`);
}
