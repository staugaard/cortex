# NZ House Hunt

Electrobun desktop app for AI-powered rental property discovery in New Zealand. Uses `@cortex/listing-hunter` for the data pipeline and `@cortex/chat-core` for the conversational interview system.

## Features

- **AI Interview** — Conversational onboarding that builds a preference profile through natural dialogue
- **Discovery Pipeline** — AI agent searches TradeMe for rental listings matching your preferences
- **AI Rating** — Each listing is rated against your preference profile
- **Calibration** — Rating accuracy improves over time from your feedback
- **Persistent Chat** — Interview conversation persists across app restarts

## Getting Started

1. Copy the template and set your key:

```bash
cp apps/nz-house-hunt/.env.example apps/nz-house-hunt/.env
```

Then edit `apps/nz-house-hunt/.env`:

```bash
ANTHROPIC_API_KEY=your_key_here
```

2. Install dependencies from repo root:

```bash
bun install
```

3. Start the app:

```bash
bun run --cwd apps/nz-house-hunt dev:hmr
```

## Development

Start with Vite HMR (recommended):

```sh
bun run dev:hmr
```

This launches two processes concurrently:
- **Vite dev server** on `http://localhost:5174` serving the React webview with HMR
- **Electrobun** native shell loading the webview

Edit files in `src/mainview/` and changes appear instantly. Changes to `src/bun/` require restarting.

### CEF mode (for CDP/automation)

```sh
bun run dev:hmr:cef
```

### Clean shutdown

```sh
bun run dev:stop
```

## Verifying UI in the app

For the full automation and verification workflow, see `docs/automation-runbook.md`.

**Do not open `http://localhost:5174` in a regular browser.** The Electrobun RPC bridge requires native globals that only exist inside the Electrobun shell.

## Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Build webview + start Electrobun (no HMR) |
| `bun run dev:hmr` | Vite HMR + Electrobun dev (recommended) |
| `bun run dev:cef` | Build + start with CEF renderer (CDP on port 9222) |
| `bun run dev:hmr:cef` | HMR + CEF renderer |
| `bun run dev:stop` | Clean shutdown of all dev/test processes |
| `bun run build` | Production build (Vite + Electrobun) |
| `bun run typecheck` | TypeScript type checking |
| `bun run cdp:check` | Verify CDP endpoint is alive (requires CEF mode) |
| `bun run cdp:targets` | List CDP page targets |

## Architecture

### Interview System (Phase 4)

On first launch, the app shows a conversational interview powered by a `ToolLoopAgent` from `@cortex/listing-hunter`. The agent asks about rental preferences and saves a preference profile via the `save_preference_profile` tool (hidden from the UI stream). The interview uses chat-core's streaming infrastructure bridged through Electrobun RPC.

### Data Flow

1. **Interview** builds a preference profile document
2. **Discovery** agent searches TradeMe using source tools, guided by the profile
3. **Rating** agent scores each listing against the profile
4. **Calibration** agent adjusts rating behavior based on user feedback

### Directory Structure

```
src/
├── bun/                          # Native process (Bun runtime)
│   ├── index.ts                  # App entry: ListingHunter + RPC + BrowserWindow
│   ├── rpc.ts                    # RPC handlers: listings + interview chat
│   ├── listing-schema.ts         # Zod schema for NZ rental listings
│   └── trademe-tools.ts          # TradeMe source tools for discovery
└── mainview/                     # Webview (React, browser context)
    ├── App.tsx                   # View routing: interview vs feed
    ├── InterviewView.tsx         # Chat UI for preference interview
    ├── interview-transport.ts    # Electrobun chat transport
    ├── types.ts                  # AppSchema (listing + chat RPC types)
    ├── rpc.ts                    # RPC bridge (webview side)
    ├── main.tsx                  # React bootstrap
    ├── index.html / index.css    # HTML entry + Tailwind theme
    └── lib/utils.ts              # cn() utility
scripts/
└── stop-testing-session.mjs      # Graceful shutdown of dev processes
docs/
└── automation-runbook.md         # UI verification workflow
data/
├── nz-house-hunt.sqlite          # Listings, documents, pipeline runs
└── interview-chat.sqlite         # Interview conversation persistence
```

## Dependencies

- `@cortex/listing-hunter` — Discovery pipeline, rating, calibration, interview agent
- `@cortex/chat-core` — Chat persistence, streaming transport, React components
- `ai` / `@ai-sdk/react` — Vercel AI SDK for agent loop and chat hooks
- `electrobun` — Desktop shell with typed RPC bridge

## Runtime Boundaries

- **`src/bun/`** runs in Bun — file system, `electrobun/bun`, Node built-ins. No DOM.
- **`src/mainview/`** runs in the webview — DOM, React, `electrobun/view`. No Bun/Node.
- The RPC bridge is the only communication channel between the two.
