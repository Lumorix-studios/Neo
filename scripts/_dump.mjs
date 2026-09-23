import { readFileSync } from "node:fs";
const f = "src/App.tsx";
const L = readFileSync(f, "utf8").split(/\n/);
for (const n of [1231, 1232, 1241, 1242, 1243]) {
  console.log(`${n + 1}: ${JSON.stringify(L[n])}`);
}
