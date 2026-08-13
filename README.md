# AgenticCoder

A lightweight, desktop-first AI chat application built with **React**, **TypeScript**, and **Tauri**. Focused on providing a fast, native experience with a modern UI and smooth animations.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Tauri](https://img.shields.io/badge/Tauri-24C8D8?style=for-the-badge&logo=tauri&logoColor=white)
<img src="https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white">

## About

AgenticCoder is a desktop application that lets you chat with AI models locally. Your data stays on your device — no collection, no transmission, no storage on external servers.

## Current Features

* **AI Chat** — Chat with configured AI models (requires API key)
* **Settings Sidebar** (Ctrl+B) — Configure API key, model, system prompt, and base URL
* **Top Menu** — Quick access to Settings, Information, Privacy Policies, and Tab 2
* **Chat History** — Persisted locally using Tauri storage
* **Responsive Layout** — Adapts between compact and expanded sidebar widths
* **Animated UI** — ClickSpark, PixelTransition, and smooth transitions
* **Command Palette** — Access all features via keyboard shortcuts
* **Info & Privacy Panels** — Built-in policy and information views

## Tech Stack

* React
* TypeScript
* Tauri
* Rust
* Vite
* Tailwind CSS

## Development

Clone the repository:

```bash
git clone https://github.com/Lumorix-studios/Neo.git
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run tauri dev
```

## Project Status

This project was started in **may 2026** and is under active development. Features, APIs, and the interface may change frequently as development progresses.

All application data — including settings and chat history — is stored **locally on your device**. We do not collect, transmit, or store any personal data on external servers.

Feedback, bug reports, and suggestions are welcome.