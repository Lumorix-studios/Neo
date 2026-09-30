/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/madhusudhan-rgb/Neo) for more information on permissions to use this code.
 */

/*
 * Signed desktop builds.
 *
 * `tauri build` refuses to bundle while `plugins.updater.pubkey` is set in
 * `src-tauri/tauri.conf.json` (it is, for the in-app updater) unless the
 * matching private key is available, and otherwise stops with:
 *
 *   A public key has been found, but no private key.
 *   Make sure to set `TAURI_SIGNING_PRIVATE_KEY` environment variable.
 *
 * This wrapper locates the key pair written by
 * `tauri signer generate -w ~/.tauri/neo.key`, exports the variables the Tauri
 * CLI expects (`TAURI_SIGNING_PRIVATE_KEY` / `..._PATH`) and forwards all
 * remaining arguments to the CLI, so a release build is `npm run build:desktop`
 * plus the key password.
 *
 * Run it from the repository root.
 *
 *   node scripts/desktop-build.mjs                 signed `tauri build`
 *   node scripts/desktop-build.mjs --unsigned      bundle without updater artifacts
 *   node scripts/desktop-build.mjs --bundle-only   re-bundle/re-sign target/release/app.exe
 *   node scripts/desktop-build.mjs --dry-run       print command + environment, run nothing
 *   node scripts/desktop-build.mjs -- --no-bundle  arguments after `--` reach the Tauri CLI
 *
 * Environment:
 *   NEO_SIGNING_KEY                     key file (default `~/.tauri/neo.key`)
 *   NEO_SIGNING_KEY_PASSWORD_FILE       password file (default `~/.tauri/neo.key.password`)
 *   TAURI_SIGNING_PRIVATE_KEY           key content; wins over the file lookup
 *   TAURI_SIGNING_PRIVATE_KEY_PASSWORD  key password; wins over the password file
 *
 * Lost the password? `node scripts/rotate-updater-key.mjs` replaces the pair
 * and writes a fresh password file.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const CLI = join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
const CONFIG = join(root, "src-tauri", "tauri.conf.json");
const SIGNING_VARS = [
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PATH",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
];

/** Path relative to the repository root, so console output stays readable. */
function rel(path) {
  return path.startsWith(root) ? path.slice(root.length + 1) : path;
}

const flags = { unsigned: false, bundleOnly: false, dryRun: false, help: false };
const forwarded = [];
for (const arg of process.argv.slice(2)) {
  if (arg === "--unsigned") flags.unsigned = true;
  else if (arg === "--bundle-only") flags.bundleOnly = true;
  else if (arg === "--dry-run") flags.dryRun = true;
  else if (arg === "--help" || arg === "-h") flags.help = true;
  else forwarded.push(arg);
}

if (flags.help) {
  console.log(
    [
      "Usage: node scripts/desktop-build.mjs [--unsigned] [--bundle-only] [--dry-run] [-- <tauri args>]",
      "",
      "  --unsigned      bundle without updater artifacts (no signing key required)",
      "  --bundle-only   run `tauri bundle` for the existing target/release/app.exe",
      "  --dry-run       print the resolved command and environment, then stop",
      "",
      "Remaining arguments are forwarded to the Tauri CLI.",
      "",
      "Signing credentials:",
      "  key       NEO_SIGNING_KEY or ~/.tauri/neo.key",
      "  password  TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
      "            or NEO_SIGNING_KEY_PASSWORD_FILE (default ~/.tauri/neo.key.password)",
      "  rotate    node scripts/rotate-updater-key.mjs",
    ].join("\n"),
  );
  process.exit(0);
}

if (!existsSync(CLI)) {
  console.error(`Cannot find the Tauri CLI at ${rel(CLI)} — run \`npm install\` first.`);
  process.exit(1);
}

const env = { ...process.env };

if (!flags.unsigned) {
  const inlineKey = env.TAURI_SIGNING_PRIVATE_KEY?.trim();
  const keyPath = env.NEO_SIGNING_KEY ?? join(homedir(), ".tauri", "neo.key");

  if (inlineKey) {
    env.TAURI_SIGNING_PRIVATE_KEY = inlineKey;
    console.log("[sign] Using the private key from TAURI_SIGNING_PRIVATE_KEY.");
  } else if (existsSync(keyPath)) {
    // Trailing whitespace is not stripped by the CLI and breaks base64 decoding.
    env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(keyPath, "utf8").trim();
    env.TAURI_SIGNING_PRIVATE_KEY_PATH = keyPath;
    console.log(`[sign] Using the updater signing key ${keyPath}.`);

    const configuredPubkey = JSON.parse(readFileSync(CONFIG, "utf8"))?.plugins?.updater?.pubkey;
    const pubPath = `${keyPath}.pub`;
    if (configuredPubkey && existsSync(pubPath)) {
      if (readFileSync(pubPath, "utf8").trim() === configuredPubkey.trim()) {
        console.log("[sign] Key pair matches plugins.updater.pubkey in src-tauri/tauri.conf.json.");
      } else {
        console.warn(`[sign] WARNING: ${pubPath} does not match plugins.updater.pubkey in ${rel(CONFIG)}.`);
        console.warn("[sign] WARNING: updates signed with this key are rejected by apps built from this config.");
      }
    }
  } else {
    console.error(
      [
        `[sign] No updater signing key found at ${keyPath}.`,
        "",
        "Bundling needs the private key matching plugins.updater.pubkey in",
        "src-tauri/tauri.conf.json, otherwise `tauri build` stops with:",
        "",
        "  A public key has been found, but no private key.",
        "  Make sure to set `TAURI_SIGNING_PRIVATE_KEY` environment variable.",
        "",
        "Pick one:",
        "  - point NEO_SIGNING_KEY at an existing key file,",
        "  - export TAURI_SIGNING_PRIVATE_KEY (key content) yourself,",
        "  - create a new pair:  npx tauri signer generate -w ~/.tauri/neo.key",
        "    then copy the new .pub file into plugins.updater.pubkey,",
        "  - or bundle without updater artifacts:  npm run build:desktop:unsigned",
      ].join("\n"),
    );
    process.exit(1);
  }

  const passwordFile = env.NEO_SIGNING_KEY_PASSWORD_FILE ?? join(homedir(), ".tauri", "neo.key.password");
  if (env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD !== undefined) {
    console.log("[sign] Using the key password from TAURI_SIGNING_PRIVATE_KEY_PASSWORD.");
  } else if (existsSync(passwordFile)) {
    // Trailing newlines would become part of the password and break decryption.
    env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = readFileSync(passwordFile, "utf8").trim();
    console.log(`[sign] Using the key password from ${passwordFile}.`);
  } else {
    console.log(
      `[sign] TAURI_SIGNING_PRIVATE_KEY_PASSWORD is unset and ${passwordFile} does not exist — the Tauri CLI will prompt for it.`,
    );
    if (!process.stdin.isTTY) {
      console.warn("[sign] WARNING: stdin is not interactive, so that prompt cannot be answered.");
      console.warn("[sign] WARNING: set TAURI_SIGNING_PRIVATE_KEY_PASSWORD for non-interactive builds.");
    }
  }
}

const args = [
  flags.bundleOnly ? "bundle" : "build",
  ...(flags.unsigned ? ["--config", "src-tauri/tauri.unsigned.conf.json"] : []),
  ...forwarded,
];

if (flags.dryRun) {
  console.log(`[dry-run] command: node ${rel(CLI)} ${args.join(" ")}`);
  for (const name of SIGNING_VARS) {
    const value = env[name];
    if (value === undefined) console.log(`[dry-run] ${name}=<unset>`);
    else if (name === "TAURI_SIGNING_PRIVATE_KEY_PATH") console.log(`[dry-run] ${name}=${value}`);
    else console.log(`[dry-run] ${name}=<set, ${value.length} characters>`);
  }
  process.exit(0);
}

const result = spawnSync(process.execPath, [CLI, ...args], { cwd: root, env, stdio: "inherit" });
if (result.error) {
  console.error(`Failed to run the Tauri CLI: ${result.error.message}`);
  process.exit(1);
}
if (result.signal) {
  console.error(`The Tauri CLI was terminated by ${result.signal}.`);
  process.exit(1);
}
process.exit(result.status ?? 1);
