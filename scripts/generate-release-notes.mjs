import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = process.argv[2] ?? packageJson.version;
const output = process.argv[3] ?? `RELEASE_NOTES_v${version}.md`;

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function findPreviousTag() {
  const tags = git("tag", "--list", "Release_v*", "--sort=-version:refname")
    .split(/\r?\n/)
    .filter(Boolean);
  return (
    tags.find((tag) => tag === `Release_v${version}`) ??
    tags.find((tag) => tag !== `Release_v${version}`) ??
    ""
  );
}

function classify(subject) {
  const text = subject.toLowerCase();
  if (/(fix|debug|bug|error|crash|repair|resolve|security|403|oauth)/.test(text)) return "Fixes";
  if (/(add|addition|feature|support|implement|introduc|mcp|agent|ollama)/.test(text)) return "Added";
  if (/(ui|ux|theme|style|layout|icon|design|refactor|rework|improv)/.test(text)) return "Improvements";
  if (/(readme|doc|license|release)/.test(text)) return "Documentation & maintenance";
  return "Other changes";
}

const previousTag = findPreviousTag();
const range = previousTag ? `${previousTag}..HEAD` : "HEAD";
const commits = git("log", "--no-merges", "--format=%h%x09%s", range)
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    const [sha, ...subjectParts] = line.split("\t");
    const subject = subjectParts.join("\t");
    return { sha, subject, category: classify(subject) };
  });

const stats = git("diff", "--stat", "--summary", range)
  .split(/\r?\n/)
  .filter(Boolean);
const changedFiles = git("diff", "--name-only", range)
  .split(/\r?\n/)
  .filter(Boolean);
const categories = ["Added", "Improvements", "Fixes", "Documentation & maintenance", "Other changes"];
const lines = [
  `# Neo v${version} — Release Notes`,
  "",
  `**Release:** v${version}`,
  `**Range:** \`${range}\` (${commits.length} commits)`,
  `**Generated:** ${new Date().toISOString()}`,
  "",
  "This file is generated from Git history and changed-file metadata. Run `npm run release:notes -- <version>` to regenerate it.",
  "",
];

for (const category of categories) {
  const items = commits.filter((commit) => commit.category === category);
  if (items.length === 0) continue;
  lines.push(`## ${category}`, "");
  for (const item of items) lines.push(`- ${item.subject} (\`${item.sha}\`)`);
  lines.push("");
}

lines.push("## Changed files", "");
if (changedFiles.length === 0) {
  lines.push("- No committed file changes found in the selected range.", "");
} else {
  for (const file of changedFiles) lines.push(`- \`${file}\``);
  lines.push("");
}

lines.push("## Diff summary", "");
if (stats.length === 0) lines.push("- No diff statistics available.", "");
else lines.push("```text", ...stats, "```", "");

writeFileSync(join(root, output), `${lines.join("\n")}\n`, "utf8");
console.log(`Wrote ${output} from ${range}.`);
