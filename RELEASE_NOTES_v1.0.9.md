# Neo v1.0.9 — Release Notes

**Release:** v1.0.9
**Range:** `Release_v1.0.8..HEAD` (14 commits)
**Generated:** 2026-09-20T01:49:22.973Z

This file is generated from Git history and changed-file metadata. Run `npm run release:notes -- <version>` to regenerate it.

## Added

- Add LICENSE file (`ab2bdd3`)
- Addition : Agent tools feature expansion and additional theme customization combinations expanded (`ac2ae06`)

## Improvements

- Refactor README for clarity and formatting (`d2d0b97`)
- Changes : Ui changes\improvements (`305c122`)

## Fixes

- Debugs  : version updating (`1fa728e`)
- Addition : Local ollama server init debugs/Ui changes (#33) (`73cc1db`)
- Debugs : Oauth debugged (`2ba61d0`)
- Changes : Oauth debugging active (`7435f01`)
- additions : OAuth added (`7c7e183`)
- Addition : OAuth additions (`87cd356`)
- Debugs : Groq api key auth had some typos regarding to the api key format auth -fixed, Mcp connection would die very quickly-fixed, Agent tools failed after a few loops-fixed (#23) (`682c9a1`)
- Changes : MCP server connection debugged (`7355d9f`)

## Documentation & maintenance

- Update LICENSE (`b69b3d1`)

## Other changes

- Change : moved from  local to Backend (`c898edf`)

## Changed files

- `.env.example`
- `.gitignore`
- `LICENSE`
- `README.md`
- `check_auth.ps1`
- `check_settings.bat`
- `components/ChatHistorySidebar.tsx`
- `components/PrivacyPolicy.tsx`
- `components/TopMenu.tsx`
- `package-lock.json`
- `package.json`
- `scripts/generate-release-notes.mjs`
- `src-tauri/Cargo.lock`
- `src-tauri/Cargo.toml`
- `src-tauri/capabilities/default.json`
- `src-tauri/cargo.txt`
- `src-tauri/cargo_final.txt`
- `src-tauri/chk.txt`
- `src-tauri/src/lib.rs`
- `src-tauri/tauri.conf.json`
- `src/App.tsx`
- `src/agentic.ts`
- `src/components/AccountSection.tsx`
- `src/components/IdeMenuBar.tsx`
- `src/components/SettingsPanel.tsx`
- `src/debugLog.ts`
- `src/ide/AgentPanel.tsx`
- `src/ide/IdeWindowApp.tsx`
- `src/lib/auth.ts`
- `src/lib/byok.ts`
- `src/lib/cloudSync.ts`
- `src/lib/deepLink.ts`
- `src/lib/supabase.ts`
- `src/mcp.ts`
- `src/providers.ts`
- `src/serverManager.ts`
- `src/store.ts`
- `src/tokenUsage.ts`
- `src/types.ts`
- `src/uiSettings.ts`
- `supabase/config.toml`
- `supabase/functions/api-keys/index.ts`
- `supabase/migrations/0001_init.sql`
- `supabase/migrations/0002_harden_profiles.sql`
- `supabase/migrations/0003_restore_table_grants.sql`
- `t_oauth.txt`
- `tsc.txt`
- `tsc_final.txt`

## Diff summary

```text
.env.example                                      |  10 +
 .gitignore                                        |  16 +-
 LICENSE                                           | 190 ++++++-
 README.md                                         | 404 ++++++++++-----
 check_auth.ps1                                    |  29 ++
 check_settings.bat                                |   1 +
 components/ChatHistorySidebar.tsx                 |   8 +-
 components/PrivacyPolicy.tsx                      |  30 +-
 components/TopMenu.tsx                            |  16 +-
 package-lock.json                                 | 116 ++++-
 package.json                                      |   7 +-
 scripts/generate-release-notes.mjs                | 101 ++++
 src-tauri/Cargo.lock                              | 125 ++++-
 src-tauri/Cargo.toml                              |   4 +-
 src-tauri/capabilities/default.json               |   2 +
 src-tauri/cargo.txt                               |   1 +
 src-tauri/cargo_final.txt                         |   1 +
 src-tauri/chk.txt                                 |   5 +
 src-tauri/src/lib.rs                              | 500 ++++++++++++++++--
 src-tauri/tauri.conf.json                         |  11 +-
 src/App.tsx                                       | 493 +++++++++++++++---
 src/agentic.ts                                    | 310 +++++++++++-
 src/components/AccountSection.tsx                 | 522 +++++++++++++++++++
 src/components/IdeMenuBar.tsx                     |   1 -
 src/components/SettingsPanel.tsx                  | 590 ++++++++++++++++++++--
 src/debugLog.ts                                   |  18 +-
 src/ide/AgentPanel.tsx                            | 205 +++++++-
 src/ide/IdeWindowApp.tsx                          |  94 +++-
 src/lib/auth.ts                                   | 512 +++++++++++++++++++
 src/lib/byok.ts                                   | 249 +++++++++
 src/lib/cloudSync.ts                              | 228 +++++++++
 src/lib/deepLink.ts                               |  76 +++
 src/lib/supabase.ts                               |  41 ++
 src/mcp.ts                                        |  80 ++-
 src/providers.ts                                  | 144 +++++-
 src/serverManager.ts                              |  27 +-
 src/store.ts                                      |  22 +-
 src/tokenUsage.ts                                 | 242 +++++++++
 src/types.ts                                      |   4 +
 src/uiSettings.ts                                 |  43 +-
 supabase/config.toml                              |  22 +
 supabase/functions/api-keys/index.ts              | 171 +++++++
 supabase/migrations/0001_init.sql                 | 165 ++++++
 supabase/migrations/0002_harden_profiles.sql      |  82 +++
 supabase/migrations/0003_restore_table_grants.sql |  25 +
 t_oauth.txt                                       |   2 +
 tsc.txt                                           |   7 +
 tsc_final.txt                                     |   7 +
 49 files changed, 5692 insertions(+), 431 deletions(-)
 create mode 100644 .env.example
 create mode 100644 check_auth.ps1
 create mode 100644 check_settings.bat
 create mode 100644 scripts/generate-release-notes.mjs
 create mode 100644 src-tauri/cargo.txt
 create mode 100644 src-tauri/cargo_final.txt
 create mode 100644 src-tauri/chk.txt
 create mode 100644 src/components/AccountSection.tsx
 create mode 100644 src/lib/auth.ts
 create mode 100644 src/lib/byok.ts
 create mode 100644 src/lib/cloudSync.ts
 create mode 100644 src/lib/deepLink.ts
 create mode 100644 src/lib/supabase.ts
 create mode 100644 src/tokenUsage.ts
 create mode 100644 supabase/config.toml
 create mode 100644 supabase/functions/api-keys/index.ts
 create mode 100644 supabase/migrations/0001_init.sql
 create mode 100644 supabase/migrations/0002_harden_profiles.sql
 create mode 100644 supabase/migrations/0003_restore_table_grants.sql
 create mode 100644 t_oauth.txt
 create mode 100644 tsc.txt
 create mode 100644 tsc_final.txt
```

