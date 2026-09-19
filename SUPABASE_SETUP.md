# Neo â€” Supabase Backend Setup

Chats, AI settings and profiles sync through Supabase; UI settings, recents,
MCP servers, terminals and token usage stay on-device. BYOK API keys are
stored **encrypted server-side** (gated by the `profiles.byok_enabled` flag
for your future paywall).

## 1. Create the project

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor** â†’ paste the contents of
   `supabase/migrations/0001_init.sql` â†’ **Run**. This creates the tables,
   RLS policies and the auto-profile trigger.
3. **Authentication â†’ Providers**: enable **Email**, **GitHub** and **Google**.
   - GitHub: create an OAuth app at github.com/settings/developers with the
     callback URL Supabase shows you.
   - Google: create OAuth credentials in Google Cloud Console with the same
     callback URL.
4. **Authentication â†’ URL Configuration â†’ Redirect URLs**: add
   `agenticcoder://auth/callback` (the app's deep link).

## 2. Point the app at your project

Copy `.env.example` to `.env` and fill in:

```
VITE_SUPABASE_URL=https://YOURPROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_OAUTH_REDIRECT_URL=agenticcoder://auth/callback
```

Restart `npm run tauri dev` after editing `.env` (Vite bakes env vars in at
build time).

## 3. Deploy the BYOK edge function (encrypted API keys)

```bash
npx supabase login                       # opens the browser once
npx supabase link --project-ref YOURPROJECTREF
npx supabase functions deploy api-keys   # JWT verification stays on (default)
npx supabase secrets set BYOK_ENCRYPTION_KEY=<64 hex chars>
```

Generate the secret with `openssl rand -hex 32` (Git Bash / WSL / macOS / Linux)
or in PowerShell:

```powershell
-join (-join (1..32 | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) }))
```

The function encrypts keys with AES-256-GCM; plaintext keys never touch the
database, and direct client access to `user_api_keys` is blocked by RLS.

> Without `BYOK_ENCRYPTION_KEY` the function returns HTTP 500
> (`BYOK_ENCRYPTION_KEY secret is missing or not 64 hex chars.`), so set it
> before testing key storage.

## 4. OAuth deep-link (desktop app)

The system browser opens for GitHub/Google sign-in and redirects to
`agenticcoder://auth/callback`. The scheme is registered in
`src-tauri/tauri.conf.json` â†’ `plugins.deep-link.desktop.schemes`, and
`register_all()` re-registers it at startup so it works without a reinstall.

On Windows/Linux the OS starts a *second* process with the URL as a CLI
argument, so `tauri-plugin-single-instance` is enabled with the `deep-link`
feature: it forwards the URL to the running window instead of opening a
duplicate app. Both plugins plus `deep-link:default` / `core:event:default`
capabilities are already configured in this repo.

On Windows the scheme only resolves once the app has been launched barefoot
at least once (the installer registers it, and `register_all()` covers the
portable/dev case).

## 5. Paywalling BYOK later

- `profiles.byok_enabled` (default `true` while you're free) gates key
  storage/fetch in the edge function.
- When you go paid: set `byok_enabled = false` for the free tier (flip the
  column default or per-user), and flip it to `true` from your billing
  webhook when a user upgrades. The app surfaces a clean "BYOK requires an
  upgraded plan" message (HTTP 402 â†’ `paywalled: true`).

## What syncs vs. what stays local

| Data | Where |
| --- | --- |
| Chats (sessions + messages) | Supabase `chats` (per user) |
| AI settings (provider/model/prompt/temp) | Supabase `user_settings` |
| Profile (name, avatar) | Supabase `profiles` |
| BYOK API keys | Supabase `user_api_keys` (AES-GCM encrypted, edge function) |
| Theme/UI settings, recents | Local disk (unchanged) |
| MCP servers, token usage, terminals, workspace state | Local disk (unchanged) |

Signing in is optional: with no account the app behaves exactly as before and
everything falls back to local storage.
