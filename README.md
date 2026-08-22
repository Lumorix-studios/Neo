# NEO

A lightweight, privacy-focused AI chat application built with **React, TypeScript, and Tauri**, designed to provide a fast, responsive, and native experience across desktop and mobile platforms.

<p align="left">
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tauri-24C8D8?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri" />
  <img src="https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white" alt="Rust" />
  <img src="https://img.shields.io/badge/Kotlin-7F52FF?style=for-the-badge&logo=kotlin&logoColor=white" alt="Kotlin" />
  <img src="https://img.shields.io/badge/CSS-663399?style=for-the-badge&logo=css&logoColor=white" alt="CSS" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
</p>

## About

NEO is a lightweight AI chat application focused on providing a fast, modern, and native-feeling experience across desktop and mobile platforms.

The application allows users to communicate with configured AI models using their own API credentials and configuration. It is designed around privacy, performance, and local data ownership, without requiring users to depend on a separate AgenticCoder cloud service.

**All application data is saved locally on the user's device.** This includes settings, configuration, and complete chat history.

NEO does not collect, transmit, or store application data on external servers.

When a user sends a request to an AI provider, that request is sent to the endpoint configured by the user. Data sent to third-party AI providers is therefore subject to the policies and infrastructure of those providers.

## Features

### AI Chat

Chat with configured AI models using your own API configuration and credentials. AgenticCoder provides a clean interface for interacting with compatible AI endpoints while keeping configuration under the user's control.

### Local Storage & Chat History

NEO keeps application data locally on the user's device.

**All chat history is saved locally**, allowing conversations to persist between sessions without requiring an AgenticCoder account or external cloud storage.

Settings, API configuration, model configuration, system prompts, and other persisted application data are also stored locally.

### Model Configuration

The settings interface provides control over the configuration used by the application, including API keys, model names, system prompts, and base URLs.

This allows users to configure the application for compatible AI services and endpoints without being locked into a single provider.

### Responsive Interface

The interface is designed to adapt to different screen sizes and form factors, allowing AgenticCoder to provide a consistent experience across desktop and mobile environments.

### Modern UI

NEO uses animated transitions and interactive components to create a responsive and polished interface.

The application incorporates components such as ClickSpark, PixelTransition, and smooth interface transitions to provide a more dynamic experience.

### Integrated Code Editor

NEO includes a built-in code editor panel (toggle with `Ctrl+Shift+E`) that turns the app into a lightweight IDE alongside your chat.

* **File explorer** — browse any folder on your machine as a workspace, or open individual files directly
* **Multi-tab editing** — up to 10 simultaneously open tabs with LRU eviction, dirty-state indicators, and close-all support
* **Syntax highlighting** — dependency-free highlighting for TypeScript, JavaScript, Python, Rust, Go, C/C++, C#, Java, Ruby, PHP, Swift, Kotlin, SQL, HTML/CSS, Markdown, YAML/TOML, Shell, and more
* **Editor essentials** — line-number gutter, active-line highlight, breadcrumb path bar, cursor position in the status bar, smart Tab/Shift+Tab indentation, auto-indent on Enter, and native undo history
* **Live external updates** — when the AI modifies a file (or anything else changes it on disk), open tabs update in real time without reopening the file

### Agentic File Tools

When a request involves files or folders, AgenticCoder enables agentic tool mode, giving the model access to filesystem tools:

`read_file`, `read_file_range`, `write_file`, `append_file`, `replace_in_file`, `delete_file`, `delete_dir`, `create_dir`, `list_dir`, `search_files`, `rename`

Destructive operations always require explicit user approval before they run, and every tool call is shown in an activity feed with its status and output. Files written by the AI stream straight into the integrated editor so changes are visible the moment they land.

### Command Palette

A built-in command palette provides quick access to application functionality and keyboard-driven workflows (`Ctrl+Shift+P`).

Frequently used functionality can be accessed without navigating through multiple interface layers.

### Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+B` | Toggle AI settings sidebar |
| `Ctrl+Shift+H` | Toggle chat history |
| `Ctrl+Shift+P` | Open command palette |
| `Ctrl+Shift+E` | Toggle code editor panel |
| `Ctrl+S` | Save the active file in the editor |

### Information & Privacy

NEO includes dedicated information and privacy views that provide users with information about the application and its approach to local data storage.

## Technology

NEO uses a modern multi-platform technology stack combining web technologies with native application development.

### Core

<p align="left">
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tauri-24C8D8?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri" />
  <img src="https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white" alt="Rust" />
  <img src="https://img.shields.io/badge/Kotlin-7F52FF?style=for-the-badge&logo=kotlin&logoColor=white" alt="Kotlin" />
</p>

### Frontend

<p align="left">
  <img src="https://img.shields.io/badge/CSS-663399?style=for-the-badge&logo=css&logoColor=white" alt="CSS" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
</p>

### Configuration

<p align="left">
  <img src="https://img.shields.io/badge/TOML-9C4221?style=for-the-badge&logo=toml&logoColor=white" alt="TOML" />
  <img src="https://img.shields.io/badge/.config-Configuration-555555?style=for-the-badge" alt=".config" />
</p>

React and TypeScript provide the primary frontend architecture, while Tauri provides the native application layer. Rust handles native functionality and application infrastructure, while Kotlin supports Android-specific development.

CSS and Tailwind CSS are used throughout the interface, with Vite providing the frontend development and build environment. TOML and `.config` files are used throughout the project's configuration and platform-specific infrastructure.

## Architecture

NEO combines a modern web frontend with a native application layer.

The frontend is built with React and TypeScript, providing a component-based architecture and a responsive user interface. Tauri connects the frontend to native functionality through Rust, providing a lightweight alternative to traditional Chromium-based desktop application frameworks.

The project also incorporates Kotlin for Android-specific functionality, allowing AgenticCoder to extend across desktop and mobile platforms while maintaining a unified project ecosystem.

## Privacy & Data

Privacy and local data ownership are fundamental principles of AgenticCoder.

**All application data is saved locally on the user's device.**

This includes:

* Complete chat history
* Application settings
* API configuration
* Model configuration
* System prompts
* Locally persisted application data

When you use the integrated code editor and agentic file tools, AgenticCoder reads and writes files **only within the workspace folder you explicitly open** (or individual files you pick). These file operations happen entirely on your device through the local Tauri/Rust layer — no file contents are uploaded anywhere by us. File contents are only sent over the network when you ask the AI to work with them, in which case they go directly to the AI provider endpoint you configured.

NEO does not collect, transmit, or store this application data on external servers.

The application does not require an AgenticCoder cloud account to store conversations or configuration.

When communicating with an AI provider, requests are sent to the endpoint configured by the user. The handling of information by that provider is governed by that provider's own privacy policies and terms.

## Development

Clone the repository:

```bash
git clone https://github.com/Lumorix-studios/Neo.git
```

Install dependencies:

```bash
npm install
```

Start the development environment:

```bash
npm run tauri dev
```

## Project Status

NEO is currently in **beta**.

The project was started in **May 2026** and is under active and continuous development. Features, APIs, architecture, platform support, and the interface may change frequently as development progresses.

NEO is intended to be **constantly developed and improved**, with ongoing work focused on new capabilities, performance improvements, additional platform support, interface refinement, and overall stability.

Because the application is currently in beta, some functionality may be incomplete or subject to change between releases.

Feedback, bug reports, and suggestions are welcome and contribute to the continued development of the project.

## Repository

The source code is available on GitHub:

https://github.com/Lumorix-studios/Neo

---

<p align="center">
  <strong>AgenticCoder</strong><br>
  A lightweight, privacy-focused AI experience built for desktop and mobile.
</p>
