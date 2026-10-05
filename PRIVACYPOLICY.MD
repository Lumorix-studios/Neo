# Privacy Policy

**Last Updated:** September 28, 2026

## Struct Privacy Policy

Thank you for using Struct.

Struct is an **early-stage development project**. Features, functionality, and behavior may change without notice as the software continues to evolve. By using this application, you acknowledge that it is provided in its current state and may contain bugs, errors, or incomplete functionality.

## No Payment Information

Struct is **free**. There is no subscription, no paid plan, and no
checkout. Lumorix Studios does not process, collect, or store any payment or
card information. No feature of the application is gated behind a paid tier.

## Data Collection

Struct is **local-first**. Application data stays on your device by default. Some data is collected server-side only when you choose to create an account, and third-party services are contacted only when you configure them.

### Without an account

Application data, including settings and configuration, is saved **only on your device**. The editor, filesystem tools, terminal, and local models (Ollama) work fully offline.

### With an account (opt-in)

If you choose to sign in, we use **Supabase** to provide the backend for that
account. Signing in means the following is stored on our servers so the feature
can work:

* **Account information** — email address, display name, avatar URL, account
  identifier, and the date you joined
* **Authentication data** — login events, session information, and security
  signals, used to protect your account
* **Application data you sync** — chat history and application settings you
  choose to synchronize
* **Provider API keys (BYOK)** — if you store a key, it is encrypted
  server-side (AES-256-GCM) before storage. The decrypted key exists only in
  memory on your device while the application is running and is never written to
  disk. Keys are scoped to your account and are not readable by other users.

An account is **optional**. You can use Struct without signing in, and you
can delete your synced data at any time from Settings → Privacy & Data.

## Local Storage

Application preferences, configuration, and other locally stored data remain on your device.

Struct does not automatically upload or synchronize this information to any servers operated by us, except for data you explicitly choose to sync while signed in.

## Filesystem Access (Code Editor & Agentic File Tools)

Struct includes an integrated code editor and agentic file tools that can read and write files on your device. This access is strictly scoped:

* **You choose the scope.** For the editor and agentic file tools, the application only accesses the workspace folder you explicitly open, or the individual files you select through the file picker. It does not scan or index arbitrary locations on your device.
* **MCP config discovery is an explicit, separate action.** The "Import from other apps" feature in Settings looks for MCP server configuration files written by other applications (Claude Desktop, Cursor, VS Code, Windsurf, and project-level `.mcp.json`). This is the one feature that reads known configuration paths outside your workspace folder. It runs only when you click **Scan**, it reads only those specific well-known config files, it never writes to them, and it does not run automatically at startup. The server definitions you import are then stored locally and shown to you for review before use.
* **All file operations are local.** Reading, writing, editing, renaming, searching, and deleting files is performed entirely on your device through the local native (Tauri/Rust) layer. No file contents are uploaded to any servers operated by us.
* **AI modifications require approval.** When the AI requests a destructive operation (writing, editing, deleting, creating, or renaming files), Struct asks for your explicit approval before executing it. Every tool call is displayed in an activity feed with its status and result.
* **Live editor sync.** Open editor tabs re-read their files from disk so changes made by the AI — or by any other process on your device — appear in real time. This polling reads only files you have opened in the editor.

## Third-Party Services You Connect (MCP Servers, OAuth Integrations)

Struct can connect to external services on your behalf. These connections are **opt-in, individually configured, and disabled by default**. Nothing below happens unless you set it up yourself.

* **Model Context Protocol (MCP) servers.** MCP servers are third-party programs you configure. Depending on the server you add, running one may allow it to read files, execute commands, or access network services within the permissions you granted it. Struct displays every tool call in its activity feed and asks for your approval before running tools a server has not marked read-only. **We do not host, operate, or review third-party MCP servers**, and their handling of your data is governed by their own authors' terms.
* **Google Workspace (Gmail and Calendar).** If you connect a Google account, Struct uses Google's OAuth flow to obtain access tokens limited to the scopes you approve. Email and calendar data is then read directly from Google and sent to the AI provider you configured, so the model can answer questions about it. Revoking access from your Google account settings immediately disables the connection. Google access tokens are stored locally on your device and are never sent to servers operated by us.

### AI provider visibility

If you ask the AI to read, modify, or look up information — a file, a web page, an email, or a calendar event — the relevant contents are sent directly to the AI provider endpoint you configured so the model can work with them. This can happen with or without a Lumorix Studios account, depending on which provider you have set up. How those providers handle that data is governed by their own privacy policies and terms.

## No Warranty

Struct is provided **"AS IS"**, without warranty of any kind, express or implied, including but not limited to warranties of:

* Merchantability
* Fitness for a particular purpose
* Reliability
* Availability
* Accuracy
* Non-infringement

There is no guarantee that the software will be error-free, secure, or uninterrupted.

## Limitation of Liability

By using Struct, you acknowledge and agree that you use the software **entirely at your own risk**.

To the maximum extent permitted by applicable law, the developers and contributors of Struct shall **not be liable** for any direct, indirect, incidental, consequential, special, exemplary, or punitive damages, including but not limited to:

* Data loss
* Loss of profits
* Corrupted files
* Hardware or software damage
* Security incidents
* Service interruptions
* Any other damages arising from the use or inability to use the application

You assume full responsibility for any actions taken using the software and any consequences resulting from those actions.

## Open Source License

Struct is distributed under the **Struct Source-Available License 1.0**.

The license grants permission to use, modify, and share the software for
personal and other non-commercial purposes. Commercial redistribution requires
prior written permission from Lumorix Studios.

The software is provided **without warranty** as described in the license.

## Changes to This Policy

This Privacy Policy may be updated as the project evolves. Continued use of Struct after changes are made constitutes acceptance of the updated policy.

## Contact

If you have questions regarding this Privacy Policy or the project, please contact the project maintainer through the official GitHub repository or other official project channels.