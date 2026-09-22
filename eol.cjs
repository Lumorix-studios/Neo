/* Diagnoses why multi-line edits fail on a file: prints the BOM, the dominant
 * line terminator, and a JSON dump of the requested lines.
 * Usage: node eol.cjs src/components/BottomPanel.tsx 101 107                  */
const fs = require("fs");
const file = process.argv[2];
const from = Number(process.argv[3] || 1);
const to = Number(process.argv[4] || from);

const raw = fs.readFileSync(file);
console.log("bytes:", raw.length);
console.log("first 4 bytes:", [...raw.slice(0, 4)].map((b) => b.toString(16)).join(" "));
const text = raw.toString("utf8");
console.log("CRLF count:", (text.match(/\r\n/g) || []).length);
console.log("bare LF count:", (text.match(/(?<!\r)\n/g) || []).length);
console.log("bare CR count:", (text.match(/\r(?!\n)/g) || []).length);
console.log("tabs:", (text.match(/\t/g) || []).length);

const lines = text.split(/\r\n|\n|\r/);
for (let i = from - 1; i < Math.min(to, lines.length); i++) {
  const raw2 = text.split(/(?<=\r\n)|(?<=\n)/);
  const codes = [...lines[i]].map((c) => c.charCodeAt(0));
  const unusual = codes.filter((c) => c === 0xa0 || c === 0x200b || c === 0xfeff || c > 126);
  console.log(`  ${i + 1}: ${JSON.stringify(lines[i])}`);
  if (unusual.length) {
    console.log(`       unusual char codes: ${unusual.map((c) => "U+" + c.toString(16)).join(", ")}`);
  }
}
console.log("\n-- line terminators --");
const withEol = text.split(/(?<=\r\n)|(?<=\n)/).filter((s) => s.length);
withEol.forEach((s, i) => {
  const t = s.endsWith("\r\n") ? "CRLF" : s.endsWith("\n") ? "LF" : "none";
  if (t !== "LF") console.log(`  line ${i + 1}: ${t}`);
});
