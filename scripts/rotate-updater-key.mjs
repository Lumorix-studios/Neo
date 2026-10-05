/*
 * Author: Lumorix Studios
 * Check the LICENSE in the GitHub repo (https://github.com/Lumorix-studios/Struct) for more information on permissions to use this code.
 */

/*
 * Replace the updater signing key pair.
 *
 * `plugins.updater.pubkey` in `src-tauri/tauri.conf.json` is baked into every
 * build, so an installed app verifies its updates against the key that signed
 * them. Once the private key (or only its password) is lost, updates for the
 * installed apps can no longer be signed, and the only way forward is a new
 * pair plus a one-time manual install for everyone still running a build that
 * carries the old pubkey.
 *
 * This script
 *   1. copies the current pair and the configured pubkey into a backup folder,
 *   2. generates a replacement pair (random password unless `--password`),
 *   3. stores the password in `~/.tauri/struct.key.password`, restricted to the
 *      current user,
 *   4. swaps `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`,
 *   5. signs a scratch file, the way the bundler does, to prove the pair works.
 *
 * Run it from the repository root:
 *
 *   node scripts/rotate-updater-key.mjs
 *   node scripts/rotate-updater-key.mjs --password "..." --password-file ./local.key.pw
 *   node scripts/rotate-updater-key.mjs --dry-run
 *
 * `scripts/desktop-build.mjs` reads the password file automatically, so
 * `npm run build:desktop` keeps working without prompts afterwards.
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const CLI = join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
const CONFIG = join(root, "src-tauri", "tauri.conf.json");
const PUBKEY_PATTERN = /("pubkey"\s*:\s*)"(?:[^"\\]|\\.)*"/;

function fail(message) {
  console.error(`[rotate] ${message}`);
  process.exit(1);
}

const flags = { dryRun: false, help: false };
const options = { key: null, password: null, passwordFile: null, backupDir: null };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === "--dry-run") flags.dryRun = true;
  else if (arg === "--help" || arg === "-h") flags.help = true;
  else if (arg === "--key") options.key = argv[++i];
  else if (arg === "--password") options.password = argv[++i];
  else if (arg === "--password-file") options.passwordFile = argv[++i];
  else if (arg === "--backup-dir") options.backupDir = argv[++i];
  else fail(`Unknown argument ${arg}. See --help.`);
}

if (flags.help) {
  console.log(
    [
      "Usage: node scripts/rotate-updater-key.mjs [options]",
      "",
      "  --key <path>            private key file (default ~/.tauri/struct.key)",
      "  --password <value>      use this password instead of a generated one",
      "  --password-file <path>  where the password is stored (default <key>.password)",
      "  --backup-dir <path>     where the current pair is kept",
      "                          (default ~/.tauri/backup-<timestamp>)",
      "  --dry-run               print the plan and stop",
      "",
      "The password is generated randomly when it comes from neither --password",
      "nor an existing password file.",
    ].join("\n"),
  );
  process.exit(0);
}

if (!existsSync(CLI)) fail(`Cannot find the Tauri CLI at ${CLI} — run \`npm install\` first.`);
if (!existsSync(CONFIG)) fail(`Cannot find ${CONFIG} — run this script from the repository root.`);

const defaultKey = existsSync(join(homedir(), ".tauri", "struct.key"))
  ? join(homedir(), ".tauri", "struct.key")
  : join(homedir(), ".tauri", "neo.key");
const keyPath = options.key ?? defaultKey;
const passwordFile = options.passwordFile ?? `${keyPath}.password`;
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const backupDir = options.backupDir ?? join(homedir(), ".tauri", `backup-${stamp}`);

/** `tauri signer generate` writes `<name>.key.pub` as base64 of the key text. */
function keyId(pubkeyBase64) {
  const text = Buffer.from(pubkeyBase64, "base64").toString("utf8");
  return text.match(/minisign public key:?\s+([0-9A-F]+)/i)?.[1] ?? "<unknown>";
}

const rawConfig = readFileSync(CONFIG, "utf8");
const currentPubkey = JSON.parse(rawConfig)?.plugins?.updater?.pubkey;
if (typeof currentPubkey !== "string" || currentPubkey.length === 0) {
  fail(`plugins.updater.pubkey is not set in ${CONFIG}.`);
}
if ((rawConfig.match(new RegExp(PUBKEY_PATTERN, "g")) ?? []).length !== 1) {
  fail(`Expected exactly one "pubkey" entry in ${CONFIG}.`);
}

const storedPassword =
  options.password === null && existsSync(passwordFile)
    ? readFileSync(passwordFile, "utf8").trim()
    : null;
const password = options.password ?? storedPassword ?? randomBytes(32).toString("hex");

console.log(`[rotate] current key id : ${keyId(currentPubkey)}`);
console.log(`[rotate] key file       : ${keyPath}`);
console.log(`[rotate] password file  : ${passwordFile}`);
console.log(`[rotate] backup folder  : ${backupDir}`);
if (storedPassword !== null) {
  console.log(`[rotate] reusing the password already stored in ${passwordFile}.`);
} else if (password === "") {
  console.log("[rotate] empty password: the new key will not be encrypted.");
} else {
  console.log("[rotate] generating a random password (32 bytes, hex).");
}

if (flags.dryRun) {
  console.log("[rotate] dry run: nothing was written.");
  process.exit(0);
}

// 1. Keep the old pair, the old pubkey and a note explaining why.
mkdirSync(backupDir, { recursive: true });
if (existsSync(keyPath)) copyFileSync(keyPath, join(backupDir, "struct.key.old"));
if (existsSync(`${keyPath}.pub`)) copyFileSync(`${keyPath}.pub`, join(backupDir, "struct.key.old.pub"));
writeFileSync(
  join(backupDir, "README.txt"),
  [
    "Backup taken by scripts/rotate-updater-key.mjs.",
    "",
    `Replaced on: ${new Date().toISOString()}`,
    `Key id:      ${keyId(currentPubkey)}`,
    "",
    "src-tauri/tauri.conf.json used to contain this pubkey:",
    "",
    currentPubkey,
    "",
    "Apps built before the rotation carry that pubkey, so only this pair can",
    "sign updates they accept. Keep these files until every installation has",
    "moved beyond that release, and restore the pubkey in tauri.conf.json if",
    "the password is ever recovered.",
    "",
  ].join("\n"),
);
console.log(`[rotate] backed up the previous pair to ${backupDir}.`);

// 2. Generate the replacement - non-interactive, so the password is explicit.
const generated = spawnSync(
  process.execPath,
  [CLI, "signer", "generate", "-w", keyPath, "--force", "-p", password, "--ci"],
  { cwd: root, stdio: "inherit" },
);
if (generated.status !== 0) {
  fail("`tauri signer generate` failed; the old pair is untouched and backed up.");
}

// 3. Store the password next to the key, readable only by this user.
writeFileSync(passwordFile, `${password}\n`, { mode: 0o600 });
if (process.platform === "win32" && process.env.USERNAME) {
  const acl = spawnSync(
    "icacls",
    [passwordFile, "/inheritance:r", "/grant:r", `${process.env.USERNAME}:F`],
    { stdio: "ignore" },
  );
  if (acl.status === 0) {
    console.log(`[rotate] restricted ${passwordFile} to ${process.env.USERNAME}.`);
  }
}
console.log(`[rotate] stored the new password in ${passwordFile}.`);

// 4. Point the config at the new pubkey, leaving the rest of the file as is.
const pubPath = `${keyPath}.pub`;
if (!existsSync(pubPath)) fail(`Expected ${pubPath} after generating the pair.`);
const nextPubkey = readFileSync(pubPath, "utf8").trim();
if (nextPubkey === currentPubkey) fail("The generated pubkey equals the old one; nothing to swap.");
writeFileSync(CONFIG, rawConfig.replace(PUBKEY_PATTERN, `$1${JSON.stringify(nextPubkey)}`));
console.log(
  `[rotate] plugins.updater.pubkey is now ${keyId(nextPubkey)} (${nextPubkey.length} characters).`,
);

// 5. Sign a scratch file through the same code path the bundler uses.
const probe = join(tmpdir(), "struct-rotate-probe.txt");
writeFileSync(probe, "probe\n");
const signed = spawnSync(
  process.execPath,
  [CLI, "signer", "sign", "-f", keyPath, "-p", password, probe],
  { cwd: root, stdio: "ignore" },
);
const signature = `${probe}.sig`;
const ok = signed.status === 0 && existsSync(signature);
rmSync(probe, { force: true });
rmSync(signature, { force: true });
if (!ok) {
  fail(`the new pair could not sign a scratch file; restore ${backupDir} before shipping anything.`);
}

console.log("[rotate] the new pair signs successfully.");
console.log(
  [
    "",
    "Next steps:",
    "  1. npm run build:desktop        # full rebuild, so the app embeds the new pubkey",
    "  2. publish the bundles together with latest.json (see README)",
    "  3. everybody still running an older build installs this version manually,",
    "     because their copy verifies updates against the previous pubkey",
  ].join("\n"),
);
