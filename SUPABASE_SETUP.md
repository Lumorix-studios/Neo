# Neo â€” Supabase Backend Setup

Chats, AI settings and profiles sync through Supabase; UI settings, recents,
MCP servers, terminals and token usage stay on-device. BYOK API keys are
stored **encrypted server-side** (gated by the `profiles.byok_enabled` flag
for your future paywall).

## 1. Create the project

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor** â†’ paste the contents of
   `supabase/migrations/0001_init.sql` â†’ **Run**. This creates the tables,
   RLS policies and the auto-profile trigger. Then run
   `supabase/migrations/0002_harden_profiles.sql` to lock the entitlement
   columns so users cannot grant themselves BYOK (see section 5).
3. **Authentication â†’ Sign In / Providers**: enable **Email** (works out of the
   box), plus **GitHub** and **Google** if you want social sign-in.

   Email/password works with no extra setup. The social buttons need the
   provider switched on first, otherwise the app (and `curl`) returns:

   ```json
   {"code":400,"error_code":"validation_failed",
    "msg":"Unsupported provider: provider is not enabled"}
   ```

   That message means *only* "the toggle is off" (or the client secret is
   blank) â€” it is not an app bug, and it never names which provider. The app
   now rewrites it to name the button you pressed.

   #### GitHub

   1. Copy your callback URL. It is always
      `https://<project-ref>.supabase.co/auth/v1/callback` â€” find the exact
      value (with a **Copy** button) at Authentication â†’ Sign In / Providers â†’
      GitHub. For this project it is
      `https://ogwdqjqwbjyygpuqrmyf.supabase.co/auth/v1/callback`.
   2. Go to <https://github.com/settings/developers> â†’ **OAuth Apps** â†’
      **New OAuth App**.
      - **Application name**: `Neo`
      - **Homepage URL**: any real URL (e.g. the Lumorix site or the repo)
      - **Authorization callback URL**: paste the callback URL from step 1
      - Leave **Enable Device Flow** *unchecked*, then **Register application**.
   3. Copy the **Client ID**, then **Generate a new client secret** and copy it
      (GitHub only shows it once).
   4. Paste both into Supabase â†’ Authentication â†’ Sign In / Providers â†’
      GitHub â†’ toggle **Enabled ON** â†’ **Save**.

   #### Google

   1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
      create/select a project, then configure the **OAuth consent screen**
      (Google Auth Platform â†’ Audience): choose **External**, set a support
      email, and add the scopes `openid`, `.../auth/userinfo.email`,
      `.../auth/userinfo.profile`. While the app is in **Testing** status you
      must add your own Google account under **Test users** or sign-in fails
      with `access_denied`.
   2. **Credentials â†’ Create credentials â†’ OAuth client ID â†’ Web application**:
      - **Authorized JavaScript origins**: `https://<project-ref>.supabase.co`
      - **Authorized redirect URIs**: the same callback URL as GitHub,
        `https://<project-ref>.supabase.co/auth/v1/callback`
   3. Copy the **Client ID** + **Client secret** into Supabase â†’ Authentication
      â†’ Sign In / Providers â†’ Google â†’ toggle **Enabled ON** â†’ **Save**.

4. **Authentication â†’ URL Configuration â†’ Redirect URLs**: add
   `agenticcoder://auth/callback` (the app's deep link). Custom URI schemes are
   supported here, and this entry is what lets Supabase hand the session back to
   the desktop app instead of a web page. If it is missing, sign-in bounces to
   the Site URL and the app never receives a token.
   Also set **Site URL** to something non-localhost (e.g. your site) â€” it is the
   fallback when no `redirectTo` is supplied.

5. **Authentication â†’ Providers â†’ Email**: if **Confirm email** is left ON,
   new sign-ups must click the emailed link before they can sign in. The app
   already shows "Check your inbox â€” confirm your email to finish signing up."

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

### Entitlements are server-owned

`0002_harden_profiles.sql` revokes the client's right to write `plan` /
`byok_enabled` (column-level privileges) and adds a trigger that rejects any
change to those columns arriving with a user JWT. Without it, a signed-in user
could run `update({ byok_enabled: true })` on their own row with the public
anon key and unlock BYOK for free.

Grant or revoke a plan from the SQL Editor, the dashboard, or your billing
webhook — these run as service role, which the trigger lets through:

```sql
-- upgrade
update public.profiles set byok_enabled = true,  plan = 'pro'  where id = '<user-uuid>';
-- downgrade
update public.profiles set byok_enabled = false, plan = 'free' where id = '<user-uuid>';
```

Expect only `display_name` / `avatar_url` / `updated_at` to be client-writable:

```sql
select privilege_type, column_name
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'profiles'
  and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE')
order by privilege_type, column_name;
```

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
