# Neo v1.0.7 — Build Release Notes

**Release:** v1.0.7 (Beta) — AI-native code workspace
**Product:** ProjectNeo (`com.lumorixstudios.agenticcoder`)
**Range:** `Release_v1.0.7` → `main` (16 commits) · `package.json` 1.0.4 → 1.0.7

## Highlights
- In-editor Agent panel — no more switching back to the main chat to work on code.
- Real MCP client (stdio + Streamable HTTP) with Settings UI and agent integration.
- AGI tool expansion: web search/fetch, project-structure analysis, higher tool-use limits, fallbacks.
- Project indexing / architecture map so the agent understands the workspace without reading every file.
- Local-model reliability: Ollama auto-detect, port discovery, external-server guard, `qwen2.5-coder` default.
- UI overhaul: empty-state refresh, editor tab strip, icon pass, extensions panel, context-strip visibility fix.

## New Features
- **Agent panel in the code editor (`src/ide/AgentPanel.tsx`, new ~1323 lines)** — full chat + tool loop docked next to `CodeEditor`, with mode switcher and suggestion chips.
- **AGI tools (`src/agentic.ts` +427)** — added `web_search`, `web_fetch`, `analyze_project_structure`; structured `data` payloads (e.g. `FsEntry[]`) for rich UI; MCP tools injected into system prompt as `mcp_<server>_<tool>`; tool-call fallbacks; more efficient multi-round calls.
- **Project index (`src/projectIndex.ts`, new)** — `generateProjectMap()` / `getProjectContext()` scans workspace, extracts classes/functions/interfaces/Rust `pub fn` symbols, skips binaries + files >512 KB; feeds `PROJECT ARCHITECTURE MAP` to agent.
- **MCP client (`src/mcp.ts` +298)** — `http` (Streamable HTTP, JSON + SSE, `Mcp-Session-Id`, custom headers) + `stdio` (Rust `mcp_stdio_*` child processes); `neochat.mcp.v2` storage with v1 migration; `describeServer()`; better HTTP error bodies.
- **Top menu (`components/TopMenu.tsx`, `src/App.tsx` +235)** — new AGI entry points and wiring.
- **Motion primitives (`components/BlurText.tsx`, `StarBorder.tsx`, `TextType.tsx`, new)** — animated welcome heading, star-border cards, typewriter empty states; deps `motion`, `react-aria-components`, `tailwind-merge`, `@untitledui/icons`.
- **Server manager (`src/serverManager.ts`, new)** — `checkServerHealth()` validates real Ollama via `/api/version`; `findAvailableOllamaPort()`; `ensureServerRunning()`.
- **Utils (`src/utils.ts`, `src/utils/cx.ts`, new)** — `shortPath()` for context strip; `cx` Tailwind-merge helper.
- **IDE window (`src/ide/IdeWindowApp.tsx` +389)** — workspace + editor-tab state, agent toggle with busy dot, `IoChatboxEllipsesOutline` icon, `unreleased` build fix (removed unused `react-icons` imports).

## Improvements & Fixes
- **Context strip visibility (`src/App.tsx`, HEAD `2539a9b`)** — removed opaque `.fade-top` overlay (`z-10`, `background: var(--bg-base)`) that painted over the strip; strip is now `relative z-20 shrink-0`; replaced undefined `no-scrollbar` with `[scrollbar-width:none] [&::-webkit-scrollbar]:hidden`; brightened `zinc-600/700 → 400`, chips `→ zinc-200 / blue-300`; added `data-debug` hooks; fixed leading-space class on welcome wrapper.
- **Welcome / empty state** — removed emblem block + tagline + status chips (commented out provider/workspace/agent chips); centered `BlurText Ready to start working?`; stripped `AgentPanel` emblem/title for cleaner empty view.
- **Editor tabs (`b75bb18`)** — close-all-tabs button, VS Code-style active-tab merge.
- **Ollama backend (`src-tauri/src/lib.rs` +360)** — `OllamaStartStatus { running, already_running, owned }` / `OllamaStopStatus`; `prune_dead_child()` drops stale handles; reuses external server instead of duplicate-spawn; waits for port 11434 before reporting started; accurate stop reporting.
- **Local models (`src/localModels.ts` +66, `LocalModels.tsx` +56)** — init finds alternate port if 11434 taken; default model `llama3.2:latest → qwen2.5-coder`; provider fallback `openai → ollama`.
- **Providers (`src/providers.ts`)** — fallback + default aligned to Ollama (local-first).
- **Settings / Extensions (`SettingsPanel.tsx` +294, `GitPanel.tsx`, `extensionsRuntime.ts`, `highlight.ts`, `FileExplorer.tsx`, `IdeMenuBar.tsx`, `CodeEditor.tsx`)** — Extensions panel rework, settings copy pass, syntax-highlight tweak, explorer/menu/editor polish.
- **Infra (`vite.config.ts`)** — `strictPort: true → false` so Vite hops ports instead of white-screening Tauri when 5173 is taken; `tsconfig.json` tweaks.
- **Assets** — added `COMPANYlogo.jpg`, `logo2.jpg`, `OPEN_GL_BOOK.pdf`.

## Known Issues / Follow-ups
- `fade-top` CSS class in `src/index.css` is now unused — remove or convert to gradient if a scroll fade is still wanted.
- Version strings drifted: `package.json` + `tauri.conf.json` = 1.0.7, but `Cargo.toml` / `mcp.ts CLIENT_INFO` / `package-lock.json` still say 1.0.4/1.0.3 — align before publishing updater artifacts.
- `src-tauri` build was not verified in this pass (`cargo`/Tauri CLI not run); run `npm run build` + `tauri build` before tagging.
- Uncommitted change in working tree: `src/ide/IdeWindowApp.tsx` icon-import cleanup — commit it so the build passes (`tsc -b` currently fails on unused imports without it).

## Upgrade Notes
- MCP configs auto-migrate `neochat.mcp.v1 → v2`; stdio servers need `command`/`args`/`cwd`/`env` filled in Settings.
- Default provider is now Ollama / `qwen2.5-coder` — pull it (`ollama pull qwen2.5-coder`) or switch provider in Settings.
- No breaking storage changes beyond the MCP key bump.

## Commits Included
`60e0ef7` Settings panel in code env · `4ea1dda` Icons · `fe2a74c` . · `a35456a`/`1e08451`/`d3aad06` UI fixes · `65900a1` empty-state · `e0dcbb1` agent panel · `cc36df9` MCP client · `b75bb18` tab strip · `c0270a0` agentic tools + local-model debug · `ee9c34b` better tools · `83c2503` fallbacks + indexing · `de89f67` AGI tools · `1eaed07` UI + extensions · `2539a9b` context-strip fix
