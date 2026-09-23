// temp helper: dump line ranges from a file
import { readFileSync } from "node:fs";
const [file, start, end] = process.argv.slice(2);
const lines = readFileSync(file, "utf8").split(/\r?\n/);
const a = Math.max(0, Number(start) - 1);
const b = end ? Number(end) : lines.length;
for (let i = a; i < b && i < lines.length; i++) {
  console.log(`${i + 1}| ${lines[i]}`);
}
