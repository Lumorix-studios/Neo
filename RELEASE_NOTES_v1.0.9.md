# Neo v1.0.9 — Release Notes

**Release:** v1.0.9
**Range:** `Release_v_1.0.7-revamped..HEAD` (24 commits)
**Generated:** 2026-09-20T01:48:12.126Z

This file is generated from Git history and changed-file metadata. Run `npm run release:notes -- <version>` to regenerate it.

## Added

- Add LICENSE file (`ab2bdd3`)
- Addition : Agent tools feature expansion and additional theme customization combinations expanded (`ac2ae06`)
- Revise README for clarity and updated features (`4322a28`)

## Improvements

- Refactor README for clarity and formatting (`d2d0b97`)
- Changes : Ui changes\improvements (`305c122`)
- Change : Ui changes (`2d4d3e7`)
- Change : removed SVG icons and replaced (`7dfb0a0`)
- Change : theme customization expanded and dynamically harmonizes depending on the color combination for maximum user UX (`c982b2a`)

## Fixes

- Addition : Local ollama server init debugs/Ui changes (#33) (`73cc1db`)
- Debugs : Oauth debugged (`2ba61d0`)
- Changes : Oauth debugging active (`7435f01`)
- additions : OAuth added (`7c7e183`)
- Addition : OAuth additions (`87cd356`)
- Debugs : Groq api key auth had some typos regarding to the api key format auth -fixed, Mcp connection would die very quickly-fixed, Agent tools failed after a few loops-fixed (#23) (`682c9a1`)
- Changes : MCP server connection debugged (`7355d9f`)
- Changes : Minor debugs (`30dc6cc`)
- Debug  : positioning changes (`2c98214`)
- Debug : ollama server startup at runtime fix (`22e2eae`)
- Debug : local ai runtime errors with killing the process and starting servers (`676f197`)

## Documentation & maintenance

- Update LICENSE (`b69b3d1`)
- Modify image references and clean up README (`e9bf4b4`)
- Update image paths in README.md (`96c9b06`)

## Other changes

- Change : moved from  local to Backend (`c898edf`)
- SS (`10821b4`)

## Changed files

- `.env.example`
- `.gitignore`
- `LICENSE`
- `README.md`
- `RELEASE_NOTES_v1.0.7.md`
- `check_auth.ps1`
- `check_settings.bat`
- `components/ChatHistorySidebar.tsx`
- `components/CommandPalette.tsx`
- `components/ErrorTab.tsx`
- `components/InfoPanel.tsx`
- `components/LocalModels.tsx`
- `components/PrivacyPolicy.tsx`
- `components/StatusBar.tsx`
- `components/Tab2.tsx`
- `components/TopMenu.tsx`
- `components/WindowControls.tsx`
- `package-lock.json`
- `package.json`
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
- `src/assets/images/IDE.png`
- `"src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO.html"`
- `"src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/0-3zo1f31b-2t.js.download"`
- `"src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/0-pte7vwk-4l4.js.download"`
- `"src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/01dkdyukbdpqq.js.download"`
- `"src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/05-c3ty_6dwfk.js.download"`
- `"src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/05jmne4kgdk_-.js.download"`
- `"src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/07u_h6i539_wj.js.download"`
- `"src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/0cz1d0mv5g_q7.js.download"`
- `"src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/14mrh2-p_w84d.js.download"`
- `"src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/1sbyix0n3_cfa.js.download"`
- `"src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/26bxh4130sve_.js.download"`
- `"src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/27jktro2p5rq9.js.download"`
- `"src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/3ie42-lwb7le3.js.download"`
- `"src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/3n7dm2ojtyzwn.js.download"`
- `"src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/3rdqn8rx95pw7.js.download"`
- `"src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/3uxygroay4qcl.css"`
- `"src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/css2"`
- `"src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/f.txt"`
- `"src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/lumorix-studios.github.io.png"`
- `"src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/turbopack-0rldyqi2kcq2j.js.download"`
- `src/assets/images/TEST001.png`
- `src/assets/images/TEST002.png`
- `src/assets/images/TEST003.png`
- `src/assets/images/TEST004.png`
- `src/assets/images/TEST005.png`
- `src/assets/images/local.png`
- `src/assets/images/ollama.jpg`
- `src/assets/images/openai.png`
- `src/assets/images/orglogo.jpg`
- `src/assets/images/preview sss.png`
- `src/assets/images/previewss2.0.png`
- `src/assets/images/react.svg`
- `src/assets/images/vite.svg`
- `src/components/AccountSection.tsx`
- `src/components/AgenticActivity.tsx`
- `src/components/BottomPanel.tsx`
- `src/components/CodeEditor.tsx`
- `src/components/DebugConsole.tsx`
- `src/components/FileExplorer.tsx`
- `src/components/FileIcon.tsx`
- `src/components/FindReplaceBar.tsx`
- `src/components/GitPanel.tsx`
- `src/components/IdeMenuBar.tsx`
- `src/components/Markdown.tsx`
- `src/components/OutputPanel.tsx`
- `src/components/PortsPanel.tsx`
- `src/components/ProblemsPanel.tsx`
- `src/components/SettingsPanel.tsx`
- `src/components/TerminalView.tsx`
- `src/components/highlight.ts`
- `src/debugLog.ts`
- `src/ide/AgentPanel.tsx`
- `src/ide/IdeWindowApp.tsx`
- `src/index.css`
- `src/lib/auth.ts`
- `src/lib/byok.ts`
- `src/lib/cloudSync.ts`
- `src/lib/deepLink.ts`
- `src/lib/supabase.ts`
- `src/localModels.ts`
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
.env.example                                       |  10 +
 .gitignore                                         |  16 +-
 LICENSE                                            | 190 +++-
 README.md                                          | 422 +++++----
 RELEASE_NOTES_v1.0.7.md                            |  49 ++
 check_auth.ps1                                     |  29 +
 check_settings.bat                                 |   1 +
 components/ChatHistorySidebar.tsx                  |  57 +-
 components/CommandPalette.tsx                      |  14 +-
 components/ErrorTab.tsx                            |  33 +-
 components/InfoPanel.tsx                           |  56 +-
 components/LocalModels.tsx                         |  62 +-
 components/PrivacyPolicy.tsx                       |  56 +-
 components/StatusBar.tsx                           |  18 +-
 components/Tab2.tsx                                |  39 +-
 components/TopMenu.tsx                             |  62 +-
 components/WindowControls.tsx                      |  87 ++
 package-lock.json                                  | 116 ++-
 package.json                                       |   5 +-
 src-tauri/Cargo.lock                               | 125 ++-
 src-tauri/Cargo.toml                               |   4 +-
 src-tauri/capabilities/default.json                |   3 +
 src-tauri/cargo.txt                                |   1 +
 src-tauri/cargo_final.txt                          |   1 +
 src-tauri/chk.txt                                  |   5 +
 src-tauri/src/lib.rs                               | 965 ++++++++++++++++++---
 src-tauri/tauri.conf.json                          |  12 +-
 src/App.tsx                                        | 640 +++++++++++---
 src/agentic.ts                                     | 310 ++++++-
 src/assets/images/IDE.png                          | Bin 0 -> 339266 bytes
 ...42\200\223 verdict on lumorix-studios.NEO.html" | 777 +++++++++++++++++
 .../0-3zo1f31b-2t.js.download"                     |   9 +
 .../0-pte7vwk-4l4.js.download"                     |   1 +
 .../01dkdyukbdpqq.js.download"                     |  31 +
 .../05-c3ty_6dwfk.js.download"                     |   1 +
 .../05jmne4kgdk_-.js.download"                     |   1 +
 .../07u_h6i539_wj.js.download"                     |   2 +
 .../0cz1d0mv5g_q7.js.download"                     |   1 +
 .../14mrh2-p_w84d.js.download"                     |   1 +
 .../1sbyix0n3_cfa.js.download"                     |   1 +
 .../26bxh4130sve_.js.download"                     |   1 +
 .../27jktro2p5rq9.js.download"                     |   4 +
 .../3ie42-lwb7le3.js.download"                     |   1 +
 .../3n7dm2ojtyzwn.js.download"                     |   1 +
 .../3rdqn8rx95pw7.js.download"                     |   1 +
 .../3uxygroay4qcl.css"                             |   1 +
 .../css2"                                          | 468 ++++++++++
 .../f.txt"                                         | 255 ++++++
 .../lumorix-studios.github.io.png"                 | Bin 0 -> 1735788 bytes
 .../turbopack-0rldyqi2kcq2j.js.download"           |   2 +
 src/assets/images/TEST001.png                      | Bin 0 -> 183841 bytes
 src/assets/images/TEST002.png                      | Bin 0 -> 255992 bytes
 src/assets/images/TEST003.png                      | Bin 0 -> 225371 bytes
 src/assets/images/TEST004.png                      | Bin 0 -> 314057 bytes
 src/assets/images/TEST005.png                      | Bin 0 -> 253652 bytes
 src/assets/images/local.png                        | Bin 0 -> 211650 bytes
 src/assets/images/ollama.jpg                       | Bin 0 -> 26990 bytes
 src/assets/images/openai.png                       | Bin 0 -> 13599 bytes
 src/assets/images/orglogo.jpg                      | Bin 0 -> 15587 bytes
 src/assets/images/preview sss.png                  | Bin 0 -> 104182 bytes
 src/assets/images/previewss2.0.png                 | Bin 0 -> 265588 bytes
 src/assets/images/react.svg                        |   1 +
 src/assets/images/vite.svg                         |   1 +
 src/components/AccountSection.tsx                  | 522 +++++++++++
 src/components/AgenticActivity.tsx                 |  49 +-
 src/components/BottomPanel.tsx                     |  38 +-
 src/components/CodeEditor.tsx                      | 134 +--
 src/components/DebugConsole.tsx                    |  20 +-
 src/components/FileExplorer.tsx                    | 127 +--
 src/components/FileIcon.tsx                        |  24 +-
 src/components/FindReplaceBar.tsx                  |  32 +-
 src/components/GitPanel.tsx                        |  67 +-
 src/components/IdeMenuBar.tsx                      | 107 +--
 src/components/Markdown.tsx                        |  38 +-
 src/components/OutputPanel.tsx                     |  12 +-
 src/components/PortsPanel.tsx                      |  26 +-
 src/components/ProblemsPanel.tsx                   |  28 +-
 src/components/SettingsPanel.tsx                   | 895 +++++++++++++++----
 src/components/TerminalView.tsx                    |  26 +-
 src/components/highlight.ts                        |  19 +-
 src/debugLog.ts                                    |  18 +-
 src/ide/AgentPanel.tsx                             | 308 +++++--
 src/ide/IdeWindowApp.tsx                           | 133 ++-
 src/index.css                                      |  23 +
 src/lib/auth.ts                                    | 512 +++++++++++
 src/lib/byok.ts                                    | 249 ++++++
 src/lib/cloudSync.ts                               | 228 +++++
 src/lib/deepLink.ts                                |  76 ++
 src/lib/supabase.ts                                |  41 +
 src/localModels.ts                                 |   2 +
 src/mcp.ts                                         |  80 +-
 src/providers.ts                                   | 144 ++-
 src/serverManager.ts                               |  27 +-
 src/store.ts                                       |  22 +-
 src/tokenUsage.ts                                  | 242 ++++++
 src/types.ts                                       |   4 +
 src/uiSettings.ts                                  | 178 +++-
 supabase/config.toml                               |  22 +
 supabase/functions/api-keys/index.ts               | 171 ++++
 supabase/migrations/0001_init.sql                  | 165 ++++
 supabase/migrations/0002_harden_profiles.sql       |  82 ++
 supabase/migrations/0003_restore_table_grants.sql  |  25 +
 t_oauth.txt                                        |   2 +
 tsc.txt                                            |   7 +
 tsc_final.txt                                      |   7 +
 105 files changed, 8479 insertions(+), 1402 deletions(-)
 create mode 100644 .env.example
 create mode 100644 RELEASE_NOTES_v1.0.7.md
 create mode 100644 check_auth.ps1
 create mode 100644 check_settings.bat
 create mode 100644 components/WindowControls.tsx
 create mode 100644 src-tauri/cargo.txt
 create mode 100644 src-tauri/cargo_final.txt
 create mode 100644 src-tauri/chk.txt
 create mode 100644 src/assets/images/IDE.png
 create mode 100644 "src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO.html"
 create mode 100644 "src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/0-3zo1f31b-2t.js.download"
 create mode 100644 "src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/0-pte7vwk-4l4.js.download"
 create mode 100644 "src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/01dkdyukbdpqq.js.download"
 create mode 100644 "src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/05-c3ty_6dwfk.js.download"
 create mode 100644 "src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/05jmne4kgdk_-.js.download"
 create mode 100644 "src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/07u_h6i539_wj.js.download"
 create mode 100644 "src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/0cz1d0mv5g_q7.js.download"
 create mode 100644 "src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/14mrh2-p_w84d.js.download"
 create mode 100644 "src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/1sbyix0n3_cfa.js.download"
 create mode 100644 "src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/26bxh4130sve_.js.download"
 create mode 100644 "src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/27jktro2p5rq9.js.download"
 create mode 100644 "src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/3ie42-lwb7le3.js.download"
 create mode 100644 "src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/3n7dm2ojtyzwn.js.download"
 create mode 100644 "src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/3rdqn8rx95pw7.js.download"
 create mode 100644 "src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/3uxygroay4qcl.css"
 create mode 100644 "src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/css2"
 create mode 100644 "src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/f.txt"
 create mode 100644 "src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/lumorix-studios.github.io.png"
 create mode 100644 "src/assets/images/SniffSlop \342\200\223 verdict on lumorix-studios.NEO_files/turbopack-0rldyqi2kcq2j.js.download"
 create mode 100644 src/assets/images/TEST001.png
 create mode 100644 src/assets/images/TEST002.png
 create mode 100644 src/assets/images/TEST003.png
 create mode 100644 src/assets/images/TEST004.png
 create mode 100644 src/assets/images/TEST005.png
 create mode 100644 src/assets/images/local.png
 create mode 100644 src/assets/images/ollama.jpg
 create mode 100644 src/assets/images/openai.png
 create mode 100644 src/assets/images/orglogo.jpg
 create mode 100644 src/assets/images/preview sss.png
 create mode 100644 src/assets/images/previewss2.0.png
 create mode 100644 src/assets/images/react.svg
 create mode 100644 src/assets/images/vite.svg
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

