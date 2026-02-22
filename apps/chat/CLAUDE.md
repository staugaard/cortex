# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Desktop application built with **Electrobun** (not Electron — do not use Electron APIs or patterns). Uses Bun as the runtime and package manager.

## Commands

```bash
bun install              # Install dependencies
bun run dev:hmr          # Development with HMR (recommended)
bun run dev              # Development without HMR (uses bundled assets)
bun run build            # Build for production
bun run build:prod       # Build production release
```

## Architecture

**Two-process model:**
- `src/bun/` — Main process running in Bun. Manages windows and native desktop functionality via Electrobun APIs.
- `src/mainview/` — Renderer/UI process. React 18 app bundled by Vite, styled with Tailwind CSS.

The main process (`src/bun/index.ts`) creates a `BrowserWindow` and either loads from the Vite dev server (port 5173, for HMR) or from bundled assets at `views://mainview/index.html`.

Vite builds the React app from `src/mainview/` into `dist/`. Electrobun then copies those assets into the final desktop app bundle in `build/`.

## Electrobun Imports

- Main process (Bun): `import { BrowserWindow } from "electrobun/bun"`
- Browser context: `import { Electroview } from "electrobun/view"`

Use `views://` URLs for bundled assets. Views must be configured in `electrobun.config.ts`.

Full API reference: https://blackboard.sh/electrobun/llms.txt
