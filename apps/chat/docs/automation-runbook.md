# Chat App Automation Runbook

This runbook is the source of truth for verifying the real Electrobun app UI during development.

## Goal
Enable repeatable, tool-driven interaction with the **embedded desktop webview** (not just `http://localhost:5173` in a normal browser).

## Why This Exists
`src/mainview/chat-rpc.ts` initializes `Electroview`, which requires Electrobun-injected globals (`__electrobunWebviewId`, `__electrobunRpcSocketPort`).
A standalone browser tab does not have those globals, so RPC bootstrapping fails and the UI can appear blank/broken.

## One-Time Setup
1. Copy the template and set your key:

```bash
cp /Users/staugaard/Code/cortex/apps/chat/.env.example /Users/staugaard/Code/cortex/apps/chat/.env
```

Then edit `/Users/staugaard/Code/cortex/apps/chat/.env`:

```bash
ANTHROPIC_API_KEY=your_key_here
```

2. Install dependencies from repo root:

```bash
bun install
```

## Standard Development Modes
- Fast local UI loop (native webview):

```bash
bun run dev:hmr
```

- Automation/debug loop (CEF + CDP, required for scripted interaction):

```bash
bun run dev:hmr:cef
```

## Mandatory Verification Workflow
Run these from `/Users/staugaard/Code/cortex/apps/chat`.

1. Start the app in CDP mode:

```bash
bun run dev:hmr:cef
```

2. Confirm CDP endpoint is alive:

```bash
bun run cdp:check
bun run cdp:targets
```

Expected: JSON output with a page target for `http://localhost:5173/`.

3. Capture current UI state from the live embedded app:

```bash
bun run cdp:screenshot
```

4. Verify an actual LLM round-trip (prompt + assistant reply + screenshot):

```bash
bun run cdp:llm
```

Expected command output includes:
- `CDP attached to: http://localhost:5173/`
- `Last assistant message: ...`
- `Screenshot saved: .../output/playwright/cdp-llm-response.png`

If these are present, an actual assistant response was rendered in-app.

## CDP Scripts
- `bun run cdp:check`: prints CDP version endpoint.
- `bun run cdp:targets`: prints active page targets.
- `bun run cdp:screenshot`: attaches and captures current app UI.
- `bun run cdp:smoke`: submits a short smoke prompt and captures UI.
- `bun run cdp:llm`: submits a markdown prompt and waits for assistant response.

Script implementation:
- `/Users/staugaard/Code/cortex/apps/chat/scripts/cdp-chat-smoke.mjs`

Environment knobs for the script:
- `CDP_ENDPOINT` (default: `http://127.0.0.1:9222`)
- `CDP_PROMPT`
- `CDP_ASSISTANT_WAIT_MS` (default: `20000`)
- `CDP_WAIT_MS` (default: `1000`)
- `CDP_SCREENSHOT` (default: `output/playwright/cdp-chat.png`)

## Troubleshooting
- `Anthropic API key is missing`:
  - Ensure `/Users/staugaard/Code/cortex/apps/chat/.env` exists and contains `ANTHROPIC_API_KEY`.
  - Restart `bun run dev:hmr:cef` after editing `.env`.

- `cdp:check` fails or times out:
  - Confirm `bun run dev:hmr:cef` is still running.
  - Check for port conflicts on `9222` and `5173`.

- `cdp:targets` shows no page target:
  - Wait a few seconds for app startup, then retry.
  - Verify the app window opened successfully.

- Standalone browser page shows RPC websocket errors:
  - Expected outside Electrobun host. Use CDP workflow above.

## Artifacts
Generated screenshots are written to:
- `/Users/staugaard/Code/cortex/apps/chat/output/playwright/`

Do not commit these artifacts.
