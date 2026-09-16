# NEO

### Lightweight Agentic Coding Environment

<p align="left">
  <img src="https://skillicons.dev/icons?i=react,ts,tauri,rust,kotlin,vite,tailwind,css,toml" alt="React, TypeScript, Tauri, Rust, Kotlin, Vite, Tailwind CSS, CSS, TOML" />
</p>

> **NEO is currently in beta and under active development.**

NEO is a lightweight agentic coding environment built with React, TypeScript, Tauri, and Rust.

It combines an integrated code editor, AI agent, filesystem tools, Git integration, terminals, debugging infrastructure, MCP support, configurable model providers, and local model support into a single development environment.

NEO is designed around local data ownership and user-controlled AI infrastructure. The application does not require a NEO-operated cloud service for storing application data, conversations, configuration, or project information.

<!-- SCREENSHOT: Main NEO interface -->

<p align="center">
  <img src="src/assets/images/previewss2.0.png" alt="NEO coding environment" width="900" />
</p>

---

## Overview

NEO provides an AI-assisted development environment where models can interact with projects through controlled tools rather than being limited to generating code in a chat interface.

The agent can inspect files, search workspaces, propose and apply modifications, interact with development environments, and work with Git while keeping the developer in control of changes.

The application is designed around the following principles:

* Local-first application data
* User-controlled AI providers
* Explicit file access
* Permission-controlled modifications
* Transparent agent activity
* Native desktop integration
* Extensible tooling through MCP
* Support for local AI models

---

# Features

## Agentic Coding

NEO provides models with filesystem tools for interacting with development projects.

Available tools include:

```text
read_file
read_file_range
write_file
append_file
replace_in_file
delete_file
delete_dir
create_dir
list_dir
search_files
rename
```

The agent can use these tools to inspect and modify projects according to the user's request.

Destructive operations require explicit user approval.

Agent operations are displayed through an activity timeline with tool status and output.

<!-- SCREENSHOT: Agent activity / tool timeline -->

<p align="center">
  <img src="docs/screenshots/agent-tools.png" alt="NEO agent activity timeline" width="850" />
</p>

---

## Context Management

NEO provides controlled context access rather than automatically exposing an entire repository to the model.

The agent can work with:

* Files currently open in the editor
* Explicitly selected files
* Files discovered through search
* Files accessed through agentic filesystem tools

This approach allows users to control the information available to the model while reducing unnecessary context.

---

## Integrated Code Editor

NEO includes a built-in code editor designed to operate alongside the agent.

Features include:

* Workspace file explorer
* Folder-based workspaces
* Individual file opening
* Multi-tab editing
* Up to 10 simultaneously open tabs
* LRU tab eviction
* Dirty-state indicators
* Close-all functionality
* Syntax highlighting
* Line-number gutter
* Active-line highlighting
* Breadcrumb navigation
* Cursor position indicators
* Smart indentation
* Automatic indentation
* Native undo history
* Live external file updates

When files are modified externally or by the agent, open editor tabs can update without requiring the file to be reopened.

Toggle the editor with:

```text
Ctrl + Shift + E
```

<!-- SCREENSHOT: Code editor + file explorer -->

<p align="center">
  <img src="src/assets/images/IDE.png" alt="NEO integrated code editor" width="900" />
</p>

---

## Change Review

NEO provides explicit visibility into agent-generated modifications.

Before applying changes, the user can review proposed modifications through the application's change and diff interfaces.

Typical agent activity may appear as:

```text
{reading file}

{searching files}

{added changes}

Apply?
```

This allows users to review modifications before they become part of the project.

<!-- SCREENSHOT: Change review / diff -->

<p align="center">
  <img src="src/assets/images/previewss2.0.png" alt="NEO change review interface" width="850" />
</p>

---

## Git Integration

NEO integrates Git into the development workflow.

Git functionality provides repository awareness and change visibility while working with the agent.

The integrated diff interface allows users to inspect modifications produced during an agent session.

Git can also be used independently through the integrated terminal.

---

## Integrated PowerShell Terminal

NEO includes an integrated PowerShell terminal backed by a native PTY implementation.

The terminal provides an interactive shell environment capable of running the development tools installed on the user's system.

Examples include:

```text
PowerShell
Python
Node.js
npm
Git
Rust
Cargo
```

NEO supports multiple PowerShell sessions, allowing users to maintain separate interactive environments for development servers, commands, debugging, and other processes.

NEO does not bundle complete compiler toolchains into the application. It instead works with the development environments available on the user's machine.

<!-- SCREENSHOT: Terminal + multiple sessions -->

<p align="center">
  <img src="docs/screenshots/terminal.png" alt="NEO integrated PowerShell terminal" width="900" />
</p>

---

## Debugging and Development Infrastructure

NEO provides development-oriented infrastructure for working with local projects.

This includes:

* Debugging support
* Process management
* Port awareness
* Multiple terminal sessions
* Local project execution
* Native process integration

The application is designed to work with the tools and runtimes already installed on the user's system.

---

## Model Providers

NEO is designed to be provider-independent.

Users can configure compatible AI endpoints using their own credentials and configuration.

Configuration can include:

* API keys
* Model names
* Base URLs
* System prompts
* Provider-specific configuration

This allows users to select the AI infrastructure appropriate for their workflow.

---

## Local Models

NEO supports locally hosted models through Ollama.

Users can run an Ollama server on their own machine, pull models through their local Ollama installation, and configure NEO to use those models.

When using a local model, inference can remain entirely on the user's device.

---

## MCP Support

NEO supports the Model Context Protocol (MCP), allowing additional tools and services to be connected to the agent environment.

MCP provides an extensible mechanism for adding capabilities without requiring each integration to be implemented directly into the NEO application.

---

## Command Palette

NEO includes a keyboard-driven command palette for accessing application functionality.

Open the command palette with:

```text
Ctrl + Shift + P
```

---

# Keyboard Shortcuts

| Shortcut       | Action                     |
| -------------- | -------------------------- |
| `Ctrl+B`       | Toggle AI settings sidebar |
| `Ctrl+Shift+H` | Toggle chat history        |
| `Ctrl+Shift+P` | Open command palette       |
| `Ctrl+Shift+E` | Toggle code editor         |
| `Ctrl+S`       | Save active file           |

---

# Privacy and Local Data

NEO is designed around local application data and user-controlled infrastructure.

Application data is stored locally on the user's device, including:

* Chat history
* Application settings
* API configuration
* Model configuration
* System prompts
* Other persisted application data

NEO does not require a NEO cloud account to store application data.

## Workspace Data

The integrated editor and agentic filesystem tools operate on files within the workspace explicitly opened by the user or individual files selected by the user.

File operations are performed locally through the Tauri and Rust application layer.

NEO does not operate a server that receives or stores user workspace files.

## AI Provider Data

When a user requests that an AI model process project information, the relevant information may be transmitted to the AI endpoint configured by the user.

For example:

```text
                    NEO
                     |
             Agent / Model Layer
                     |
          +----------+----------+
          |                     |
       Ollama              Configured API
          |                     |
    Local inference       Third-party provider
```

Data sent to third-party AI providers is subject to the privacy policies, infrastructure, and terms of those providers.

NEO does not control how third-party providers process information sent to their endpoints.

---

# Architecture

NEO uses a hybrid web and native architecture.

```text
+--------------------------------------------------+
|                      NEO                         |
|                                                  |
|              React / TypeScript / TSX            |
|                         |                        |
|                         v                        |
|                      Tauri                       |
|                         |                        |
|                         v                        |
|                       Rust                       |
|                         |                        |
|       +-----------------+----------------+        |
|       |                 |                |        |
|       v                 v                v        |
|   Filesystem           Git              PTY       |
|       |                 |                |        |
|       +-----------------+----------------+        |
|                         |                        |
|                         v                        |
|                  Agent Runtime                   |
|                         |                        |
|              +----------+----------+             |
|              |                     |             |
|              v                     v             |
|         Cloud Providers          Ollama           |
|                                    |             |
|                              Local Models        |
+--------------------------------------------------+
```

## Frontend

<p align="left">
  <img src="https://skillicons.dev/icons?i=react,ts,tsx,vite,tailwind,css" alt="React, TypeScript, TSX, Vite, Tailwind CSS, CSS" />
</p>

React and TypeScript provide the primary application interface and component architecture.

Vite provides the frontend development and build environment.

Tailwind CSS and CSS are used for application styling and interface components.

## Native Application Layer

<p align="left">
  <img src="https://skillicons.dev/icons?i=tauri,rust" alt="Tauri and Rust" />
</p>

Tauri provides the native application layer while Rust handles native functionality, filesystem operations, process management, PTY integration, and other system-level functionality.

## Mobile

<p align="left">
  <img src="https://skillicons.dev/icons?i=kotlin" alt="Kotlin" />
</p>

Kotlin is used for Android-specific functionality within the broader project ecosystem.

## Configuration

<p align="left">
  <img src="https://skillicons.dev/icons?i=toml" alt="TOML" />
</p>

TOML and `.config` files are used throughout project configuration and platform-specific infrastructure.

---

# Development

## Requirements

Development requires the appropriate Tauri prerequisites for the target platform, along with the project's frontend and Rust dependencies.

Typical development environments include:

* Node.js
* npm
* Rust
* Cargo
* Tauri prerequisites
* Git

Additional project-specific runtimes and toolchains can be installed independently.

## Clone

```bash
git clone https://github.com/Lumorix-studios/Neo.git
cd Neo
```

## Install Dependencies

```bash
npm install
```

## Run Development Build

```bash
npm run tauri dev
```

---

# Project Status

NEO is currently in **beta**.

Development began in **May 2026** and the project remains under active development.

The application's architecture, interface, agent capabilities, APIs, platform support, and internal systems may change between releases.

Current development areas include:

* Agent reliability
* Context management
* Tooling
* Model compatibility
* MCP integrations
* Local model support
* Development workflows
* Performance
* Cross-platform support
* Interface refinement
* Stability

As a beta project, functionality may be incomplete or subject to change.

---

# Roadmap

NEO is continuously developed with a focus on improving the agentic development workflow.

Planned and ongoing areas include:

* Improved agent reliability
* More efficient context handling
* Expanded tool capabilities
* Additional model providers
* Expanded MCP functionality
* Improved debugging workflows
* Additional platform support
* Performance improvements
* Improved project management
* Agent observability
* Stability improvements

---

# Repository

Source code is available on GitHub:

https://github.com/Lumorix-studios/Neo

---

<p align="center">
  <strong>NEO</strong><br>
  Lightweight Agentic Coding Environment
</p>
