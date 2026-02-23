# React + Tailwind + Vite Electrobun Template

A fast Electrobun desktop app template with React, Tailwind CSS, and Vite for hot module replacement (HMR).

For reliable in-app automation and LLM verification, use the runbook:
- `docs/automation-runbook.md`

## Getting Started

```bash
# Install dependencies
bun install

# Configure API keys
cp .env.example .env

# Development without HMR (uses bundled assets)
bun run dev

# Development with HMR (recommended)
bun run dev:hmr

# Development with HMR + CEF CDP (automation/debug)
bun run dev:hmr:cef

# Build for production
bun run build

# Build for production release
bun run build:prod
```

## How HMR Works

When you run `bun run dev:hmr`:

1. **Vite dev server** starts on `http://localhost:5174` with HMR enabled
2. **Electrobun** starts and detects the running Vite server
3. The app loads from the Vite dev server instead of bundled assets
4. Changes to React components update instantly without full page reload

When you run `bun run dev` (without HMR):

1. Electrobun starts and loads from `views://mainview/index.html`
2. You need to rebuild (`bun run build`) to see changes

## Automation / CDP Mode

For tool-driven UI interaction against the embedded desktop webview, run:

```bash
bun run dev:hmr:cef
```

This enables CEF renderer mode and sets Chromium remote debugging on port `9222`.

Check CDP availability:

```bash
bun run cdp:check
bun run cdp:targets
bun run cdp:screenshot
bun run cdp:smoke
bun run cdp:llm
```

Notes:
- Opening `http://localhost:5174` in a standalone browser does not provide Electrobun-injected globals (`webviewId`, RPC socket port), so app RPC bootstrapping will fail there.
- CDP mode is intended for debugging/automation; default native renderer mode remains available via `bun run dev` / `bun run dev:hmr`.

## Project Structure

```
├── src/
│   ├── bun/
│   │   └── index.ts        # Main process (Electrobun/Bun)
│   └── mainview/
│       ├── App.tsx         # React app component
│       ├── main.tsx        # React entry point
│       ├── index.html      # HTML template
│       └── index.css       # Tailwind CSS
├── electrobun.config.ts    # Electrobun configuration
├── vite.config.ts          # Vite configuration
├── tailwind.config.js      # Tailwind configuration
└── package.json
```

## Customizing

- **React components**: Edit files in `src/mainview/`
- **Tailwind theme**: Edit `tailwind.config.js`
- **Vite settings**: Edit `vite.config.ts`
- **Window settings**: Edit `src/bun/index.ts`
- **App metadata**: Edit `electrobun.config.ts`
