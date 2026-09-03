# NEO

### Lightweight Agentic Coding Environment
### In very early stages
<p align="left">
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/TSX-3178C6?style=for-the-badge&logo=react&logoColor=white" alt="TSX" />
  <img src="https://img.shields.io/badge/Tauri-24C8D8?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri" />
  <img src="https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white" alt="Rust" />
  <img src="https://img.shields.io/badge/Kotlin-7F52FF?style=for-the-badge&logo=kotlin&logoColor=white" alt="Kotlin" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/CSS-663399?style=for-the-badge&logo=css&logoColor=white" alt="CSS" />
  <img src="https://img.shields.io/badge/TOML-9C4221?style=for-the-badge&logo=toml&logoColor=white" alt="TOML" />
</p>

NEO is a lightweight agentic coding environment built with React, TypeScript, Tauri, and Rust.

It combines an integrated code editor, AI agent, filesystem tools, Git integration, terminals, debugging infrastructure, MCP support, configurable model providers, and local model support into a single development environment.

NEO is designed around local data ownership and user-controlled AI infrastructure. The application does not require a NEO-operated cloud service for storing application data, conversations, configuration, or project information.

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

## Features

### Agentic Coding

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

---

### Context Management

NEO provides controlled context access rather than automatically exposing an entire repository to the model.

The agent can work with:

* Files currently open in the editor
* Explicitly selected files
* Files discovered through search
* Files accessed through agentic filesystem tools

This approach allows users to control the information available to the model while reducing unnecessary context.

---

### Integrated Code Editor

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

---

### Change Review

NEO provides explicit visibility into agent-generated modifications.

Before applying changes, the user can review the proposed modifications through the application's change and diff interfaces.

Typical agent activity may appear as:

```text
{reading file}

{searching files}

{added changes}

Apply?
```

This allows users to review modifications before they become part of the project.

---

### Git Integration

NEO integrates Git into the development workflow.

Git functionality provides repository awareness and change visibility while working with the agent.

The integrated diff interface allows users to inspect modifications produced during an agent session.

Git can also be used independently through the integrated terminal.

---

### Integrated PowerShell Terminal

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

---

### Debugging and Development Infrastructure

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

### Model Providers

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

### Local Models

NEO supports locally hosted models through Ollama.

Users can run an Ollama server on their own machine, pull models through their local Ollama installation, and configure NEO to use those models.

When using a local model, inference can remain entirely on the user's device.

---

### MCP Support

NEO supports the Model Context Protocol (MCP), allowing additional tools and services to be connected to the agent environment.

MCP provides an extensible mechanism for adding capabilities without requiring each integration to be implemented directly into the NEO application.

---

### Command Palette

NEO includes a keyboard-driven command palette for accessing application functionality.

Open the command palette with:

```text
Ctrl + Shift + P
```

---

## Keyboard Shortcuts

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
|                      Tauri                      |
|                         |                        |
|                         v                        |
|                       Rust                      |
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
|         Cloud Providers          Ollama          |
|                                    |             |
|                              Local Models        |
+--------------------------------------------------+
```

## Frontend

<p align="left">
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/TSX-3178C6?style=for-the-badge&logo=react&logoColor=white" alt="TSX" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/CSS-663399?style=for-the-badge&logo=css&logoColor=white" alt="CSS" />
</p>

React and TypeScript provide the primary application interface and component architecture.

Vite provides the frontend development and build environment.

Tailwind CSS and CSS are used for application styling and interface components.

## Native Application Layer

<p align="left">
  <img src="https://img.shields.io/badge/Tauri-24C8D8?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri" />
  <img src="https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white" alt="Rust" />
</p>

Tauri provides the native application layer while Rust handles native functionality, filesystem operations, process management, PTY integration, and other system-level functionality.

## Mobile

<p align="left">
  <img src="https://img.shields.io/badge/Kotlin-7F52FF?style=for-the-badge&logo=kotlin&logoColor=white" alt="Kotlin" />
</p>

Kotlin is used for Android-specific functionality within the broader project ecosystem.

## Configuration

<p align="left">
  <img src="https://img.shields.io/badge/TOML-9C4221?style=for-the-badge&logo=toml&logoColor=white" alt="TOML" />
  <img src="https://img.shields.io/badge/.config-Configuration-555555?style=for-the-badge" alt=".config" />
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
