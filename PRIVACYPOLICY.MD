# Privacy Policy

**Last Updated:** August 22, 2026

## AgenticCoder Privacy Policy

Thank you for using AgenticCoder.

AgenticCoder is an **early-stage development project**. Features, functionality, and behavior may change without notice as the software continues to evolve. By using this application, you acknowledge that it is provided in its current state and may contain bugs, errors, or incomplete functionality.

## Data Collection

AgenticCoder **does not collect, transmit, sell, or store your personal data** on any servers operated by us.

All application data, including settings and configuration, is saved **only on your device**. We do not have access to this information.

## Local Storage

Application preferences, configuration, and other locally stored data remain on your device.

AgenticCoder does not automatically upload or synchronize this information to any servers operated by us.

## Filesystem Access (Code Editor & Agentic File Tools)

AgenticCoder includes an integrated code editor and agentic file tools that can read and write files on your device. This access is strictly scoped:

* **You choose the scope.** The application only accesses the workspace folder you explicitly open, or the individual files you select through the file picker. It never scans or indexes arbitrary locations on your device.
* **All file operations are local.** Reading, writing, editing, renaming, searching, and deleting files is performed entirely on your device through the local native (Tauri/Rust) layer. No file contents are uploaded to any servers operated by us.
* **AI modifications require approval.** When the AI requests a destructive operation (writing, editing, deleting, creating, or renaming files), AgenticCoder asks for your explicit approval before executing it. Every tool call is displayed in an activity feed with its status and result.
* **Live editor sync.** Open editor tabs re-read their files from disk so changes made by the AI — or by any other process on your device — appear in real time. This polling reads only files you have opened in the editor.
* **AI provider visibility.** If you ask the AI to read or modify a file, the relevant file contents are sent directly to the AI provider endpoint you configured so the model can work with them. How those providers handle that data is governed by their own privacy policies and terms.

## No Warranty

AgenticCoder is provided **"AS IS"**, without warranty of any kind, express or implied, including but not limited to warranties of:

* Merchantability
* Fitness for a particular purpose
* Reliability
* Availability
* Accuracy
* Non-infringement

There is no guarantee that the software will be error-free, secure, or uninterrupted.

## Limitation of Liability

By using AgenticCoder, you acknowledge and agree that you use the software **entirely at your own risk**.

To the maximum extent permitted by applicable law, the developers and contributors of AgenticCoder shall **not be liable** for any direct, indirect, incidental, consequential, special, exemplary, or punitive damages, including but not limited to:

* Data loss
* Loss of profits
* Corrupted files
* Hardware or software damage
* Security incidents
* Service interruptions
* Any other damages arising from the use or inability to use the application

You assume full responsibility for any actions taken using the software and any consequences resulting from those actions.

## Open Source License

AgenticCoder is distributed under the **MIT License**.

The software is provided free of charge under the terms of the MIT License. The license grants permission to use, modify, distribute, and sublicense the software, subject to the conditions of the MIT License.

The software is provided **without warranty** as described in the license.

## Changes to This Policy

This Privacy Policy may be updated as the project evolves. Continued use of AgenticCoder after changes are made constitutes acceptance of the updated policy.

## Contact

If you have questions regarding this Privacy Policy or the project, please contact the project maintainer through the official GitHub repository or other official project channels.