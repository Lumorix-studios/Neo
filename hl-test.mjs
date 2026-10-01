/* Throwaway probe for the tokenizer: prints the HTML for comment snippets. */
import { highlightCode, highlightWindow, commentToken } from "./hl-tmp.mjs";

const cases = [
  ["ts", "typescript", "// hello comment\nconst x = 1;"],
  ["ts", "typescript", "/* block\nspanning */\nconst y = 2;"],
  ["ts", "typescript", "const url = 'https://example.com/path'; // trailing"],
  ["tsx", "typescript", "return <div>{/* JSX comment */}<b>hi</b></div>;"],
  ["py", "python", "# python comment\nprint(1)"],
  ["css", "css", "/* css comment */\n.a { color: #fff; }"],
  ["html", "html", "<!-- html comment -->\n<div/>"],
  ["sh", "shell", "# shell comment\nls -la"],
  ["regex", "javascript", "const re = /https?:\\/\\//g; const z = 1;"],
];

for (const [name, lang, code] of cases) {
  const html = highlightCode(code, lang);
  const hasCommentSpan = /class="tok-com"/.test(html);
  console.log(`--- ${name} (${lang}) token=${commentToken(lang)} commentSpan=${hasCommentSpan}`);
  console.log(html.replace(/\n/g, "\\n").slice(0, 400));
}

// Windowed path: 300-line file, comment block at line 10 (tile 0) and line 270 (tile 1).
const lines = Array.from({ length: 300 }, (_, i) => `const v${i} = ${i};`);
lines[9] = "// top comment";
lines[269] = "// bottom comment";
const big = lines.join("\n");
const win0 = highlightWindow(big, "typescript", 12);
const win1 = highlightWindow(big, "typescript", 268);
console.log("--- window top has tok-com:", win0.includes("tok-com"));
console.log("--- window bottom has tok-com:", win1.includes("tok-com"));
