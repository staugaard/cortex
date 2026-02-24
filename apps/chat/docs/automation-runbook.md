# Chat App Automation Runbook

This runbook is the source of truth for verifying the real Electrobun app UI during development.

## Goal
Verify behavior in the **embedded desktop webview** (not just `http://localhost:5174` in a normal browser).
Use either:
- direct unscripted interaction in the live app window, or
- CDP scripts when you want repeatability/artifacts.

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

- Automation/debug loop (CEF + CDP, needed only when you want scripted interaction):

```bash
bun run dev:hmr:cef
```

## Primary Verification Workflow (Manual, Unscripted)
Run from `/Users/staugaard/Code/cortex/apps/chat`.

1. Start the app:

```bash
bun run dev:hmr
```

2. Interact directly with the app window and verify:
- streaming output appears incrementally
- cancel stops an in-flight response cleanly
- session switching keeps messages isolated
- no `Save Error` toast appears during normal sends/switches
- reloading the same session restores persisted messages
- generated session title upgrades from fallback to a concise final title
- assistant messages include an `Agent activity` item that is collapsed by default

### Safe Interaction Sequencing (Important)
Use this order to avoid false negatives caused by lifecycle races:

1. New chat:
- click `New Chat`
- wait for empty-state text (`Send a message to get started`)
- verify Diagnostics `Session` shows a provisional `tmp:` ID before first send

2. First send:
- submit prompt
- wait for first assistant response to appear
- wait until composer is back in `Submit` state (not `Stop`) before next turn

3. Multi-turn:
- only send next prompt after previous turn is fully done
- if diagnosing mid-stream behavior, verify Diagnostics `Status` transitions (`submitted/streaming` -> `ready`)

4. Title validation:
- after first completed assistant turn, title may initially be fallback
- Bun should push `conversationUpdated` when async title upgrade completes
- verify rail title changes without manual reload or polling logic

5. Persistence validation:
- switch away and back, then restart app, and confirm the same session reloads with messages and upgraded title
- confirm `Agent activity` reloads with the session and is collapsed initially

### Agent Routing Validation

Validate natural manager decisioning:

1. Normal non-math path:
- send a normal non-math prompt and verify manager stays direct

2. Math-specialist path:
- send a math prompt (for example `Solve 17*(24-9)`)
- verify `Agent activity` expands to show math-expert subagent events

3. If you need scriptable checks or screenshots, switch to CEF/CDP mode:

```bash
bun run dev:hmr:cef
```

## Optional Scripted Verification (CDP)
Run these from `/Users/staugaard/Code/cortex/apps/chat` when you need repeatable scripted checks.

Scripts are optional helpers. Do not block on scripts when direct in-app interaction is faster or clearer for the current debugging task.

1. Confirm CDP endpoint is alive:

```bash
bun run cdp:check
bun run cdp:targets
```

Expected: JSON output with a page target for `http://localhost:5174/`.

2. Capture current UI state from the live embedded app:

```bash
bun run cdp:screenshot
```

3. Verify an actual LLM round-trip (prompt + assistant reply + screenshot):

```bash
bun run cdp:llm
```

Expected command output includes:
- `CDP attached to: http://localhost:5174/`
- `Last assistant message: ...`
- `Screenshot saved: .../output/playwright/cdp-llm-response.png`

If these are present, an actual assistant response was rendered in the embedded app.

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
  - Check for port conflicts on `9222` and `5174`.

- `cdp:targets` shows no page target:
  - Wait a few seconds for app startup, then retry.
  - Verify the app window opened successfully.

- Standalone browser page shows RPC websocket errors:
  - Expected outside Electrobun host. Use CDP workflow above.

- App feels blocked or profile lock errors appear:
  - Ensure only one `dev:hmr`/`dev:hmr:cef` session is running.
  - Restart the app mode you are using.

## Artifacts
Generated screenshots are written to:
- commonly `output/playwright/` relative to the execution directory

Do not commit these artifacts.
