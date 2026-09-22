/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/madhusudhan-rgb/Neo) for more information on permissions to use the code.
 */
/*
 * Full-detail compiler audit: prints the raw babel-plugin-react-compiler error
 * (with code frames and carets) for one file, so the exact offending
 * expression can be located.
 *
 * Usage: node audit-detail.cjs src/components/BillingSection.tsx
 */
const fs = require("fs");
const babel = require("@babel/core");
const compiler = require("babel-plugin-react-compiler");

const file = process.argv[2];
const code = fs.readFileSync(file, "utf8");
try {
  babel.transformSync(code, {
    filename: file,
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ["jsx", "typescript"], sourceType: "module" },
    plugins: [[compiler, { panicThreshold: "ALL_ERRORS" }]],
    compact: false,
  });
  console.log("OK " + file);
} catch (e) {
  const lines = String(e.message).split("\n");
  let pending = null;
  for (const l of lines) {
    if (/^\s*>?\s*\d+ \|/.test(l)) {
      if (/^\s*>/.test(l)) console.log(l.replace(/\s+$/, ""));
      pending = l;
    } else if (/^\s+(Todo:|Error:)/.test(l) && pending) {
      console.log("        ^^ " + l.trim().slice(0, 120));
    }
  }
}
