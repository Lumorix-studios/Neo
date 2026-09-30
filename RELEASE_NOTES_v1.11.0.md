# Neo v1.11.0 — Release Notes

**Release:** v1.11.0
**Range:** `Release_v1.10.0..HEAD` (5 commits)
**Generated:** 2026-09-29T23:57:44.383Z

This file is generated from Git history and changed-file metadata. Run `npm run release:notes -- <version>` to regenerate it.

## Added

- Addition : the agent tools are more efficient: primary changes include the web search tools (`f6d22b3`)
- Addition and changes : Ui overhaul/Billings moved to the websitehq instead of it being inside the app itself (`de8623c`)

## Improvements

- Ui changes #200 (`cbbd1d1`)

## Fixes

- Addition : Fixed the lag inside the IDE. Would lag and use more Ram due to large file contents/Ui improvements/Looks less dense (`a29908f`)

## Other changes

- Changes : paywalls removed for testing (`6bb9562`)

## Changed files

- `EULA.md`
- `PRIVACYPOLICY.MD`
- `README.md`
- `SECURITY.md`
- `components/ChatHistorySidebar.tsx`
- `components/PromptBar.tsx`
- `components/StatusBar.tsx`
- `eslint-out.txt`
- `package-lock.json`
- `package.json`
- `scripts/generate-release-notes.mjs`
- `src-tauri/src/lib.rs`
- `src-tauri/tauri.conf.json`
- `src/App.tsx`
- `src/agentic.ts`
- `src/components/AccountSection.tsx`
- `src/components/AgenticActivity.tsx`
- `src/components/BillingSection.tsx`
- `src/components/BottomPanel.tsx`
- `src/components/CodeEditor.tsx`
- `src/components/FileExplorer.tsx`
- `src/components/FindReplaceBar.tsx`
- `src/components/SettingsPanel.tsx`
- `src/components/highlight.ts`
- `src/extensions.ts`
- `src/extensionsRuntime.ts`
- `src/ide/AgentPanel.tsx`
- `src/ide/IdeWindowApp.tsx`
- `src/index.css`
- `src/lib/auth.ts`
- `src/lib/billing.ts`
- `src/lib/byok.ts`
- `src/mcp.ts`
- `src/store.ts`
- `src/types.ts`
- `src/uiSettings.ts`
- `supabase/config.toml`
- `supabase/functions/api-keys/index.ts`
- `supabase/functions/billing/SETUP.md`
- `supabase/functions/billing/index.ts`
- `supabase/migrations/0005_byok_paywall.sql`
- `supabase/migrations/0006_remove_paywalls.sql`

## Diff summary

```text
EULA.md                                      | 158 ++++++
 PRIVACYPOLICY.MD                             |  57 +-
 README.md                                    | 123 ++++-
 SECURITY.md                                  |  65 +++
 components/ChatHistorySidebar.tsx            | 235 ++++----
 components/PromptBar.tsx                     |  50 +-
 components/StatusBar.tsx                     |  28 -
 eslint-out.txt                               | 479 -----------------
 package-lock.json                            |  20 +-
 package.json                                 |   9 +-
 scripts/generate-release-notes.mjs           |  29 +
 src-tauri/src/lib.rs                         | 114 ++++
 src-tauri/tauri.conf.json                    |   4 +-
 src/App.tsx                                  | 188 ++-----
 src/agentic.ts                               | 101 +++-
 src/components/AccountSection.tsx            | 777 +++++++++++++--------------
 src/components/AgenticActivity.tsx           |  52 +-
 src/components/BillingSection.tsx            | 361 -------------
 src/components/BottomPanel.tsx               |  32 +-
 src/components/CodeEditor.tsx                | 282 +++++++---
 src/components/FileExplorer.tsx              |  14 +-
 src/components/FindReplaceBar.tsx            |   2 +-
 src/components/SettingsPanel.tsx             | 776 ++++++++++++--------------
 src/components/highlight.ts                  | 765 +++++++++++++++-----------
 src/extensions.ts                            | 266 ---------
 src/extensionsRuntime.ts                     |  87 ---
 src/ide/AgentPanel.tsx                       |  16 +-
 src/ide/IdeWindowApp.tsx                     | 243 ++++++---
 src/index.css                                |  31 ++
 src/lib/auth.ts                              |  25 +-
 src/lib/billing.ts                           | 103 ----
 src/lib/byok.ts                              |  90 ++--
 src/mcp.ts                                   | 184 +++++++
 src/store.ts                                 |   2 +-
 src/types.ts                                 |  11 +-
 src/uiSettings.ts                            |  12 +-
 supabase/config.toml                         |   8 +
 supabase/functions/api-keys/index.ts         |  31 +-
 supabase/functions/billing/SETUP.md          |  85 +++
 supabase/functions/billing/index.ts          | 374 +++++++++++--
 supabase/migrations/0005_byok_paywall.sql    |  44 ++
 supabase/migrations/0006_remove_paywalls.sql |  58 ++
 42 files changed, 3316 insertions(+), 3075 deletions(-)
 create mode 100644 EULA.md
 delete mode 100644 eslint-out.txt
 delete mode 100644 src/components/BillingSection.tsx
 delete mode 100644 src/extensions.ts
 delete mode 100644 src/extensionsRuntime.ts
 delete mode 100644 src/lib/billing.ts
 create mode 100644 supabase/functions/billing/SETUP.md
 create mode 100644 supabase/migrations/0005_byok_paywall.sql
 create mode 100644 supabase/migrations/0006_remove_paywalls.sql
```

## Uncommitted changes in this build

These files are edited in the working tree, so they are part of the bundled
binaries even though they are outside the commit range above. Commit them
before tagging the release so the tag matches the shipped build:

- `M` `README.md`
- `M` `components/PromptBar.tsx`
- `M` `package.json`
- `M` `scripts/generate-release-notes.mjs`
- `M` `src-tauri/tauri.conf.json`
- `M` `src/components/CodeEditor.tsx`
- `M` `src/components/highlight.ts`
- `??` `scripts/desktop-build.mjs`
- `??` `scripts/rotate-updater-key.mjs`

Tracked working-tree diff:

```text
README.md                          |  80 +++++++++++++++
 components/PromptBar.tsx           |  32 ++++--
 package.json                       |   6 +-
 scripts/generate-release-notes.mjs |  29 ++++++
 src-tauri/tauri.conf.json          |   2 +-
 src/components/CodeEditor.tsx      | 201 +++++++++++++++++++++++++++++++++----
 src/components/highlight.ts        | 153 ++++++++++++++++++++++++----
 7 files changed, 449 insertions(+), 54 deletions(-)
```

