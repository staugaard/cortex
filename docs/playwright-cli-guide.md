# playwright-cli for Electrobun Apps

Interactive browser automation for any Electrobun app running in CEF mode with CDP.

## Why playwright-cli

Every Electrobun app in this monorepo has a `dev:hmr:cef` script that launches the app with CEF (Chromium Embedded Framework) and exposes a Chrome DevTools Protocol endpoint on port 9222.

`playwright-cli` is a stateful, interactive CLI that connects to this endpoint. You can take snapshots, fill forms, click elements, read console logs, and take screenshots — all as one-liners. This works for humans debugging locally and for coding agents automating verification.

## How It Works

Electrobun's CEF mode starts a Chromium-based renderer with remote debugging enabled:

```
ELECTROBUN_RENDERER=cef ELECTROBUN_REMOTE_DEBUG_PORT=9222
```

`playwright-cli` connects to this endpoint using Playwright's `connectOverCDP()` under the hood. The CLI spawns a background daemon that holds the connection, so subsequent commands reuse the same session.

### The `isolated: false` requirement

This is the critical detail. The playwright-cli daemon defaults to `isolated: true`, which tells Playwright to call `browser.newContext()` after connecting. CEF does not support creating new browser contexts — it only exposes its existing context with the already-open pages. The call fails with:

```
TypeError: browserContext.newPage: Cannot read properties of undefined (reading '_page')
```

Setting `"isolated": false` in the config tells Playwright to use `browser.contexts()[0]` — the existing CEF context — instead of trying to create a new one. This is what makes the whole thing work.

## Prerequisites

1. `@playwright/cli` installed globally:
   ```bash
   npm install -g @playwright/cli@latest
   ```

2. An Electrobun app running in CEF mode:
   ```bash
   # From any app directory (apps/chat, apps/template-electrobun, etc.)
   bun run dev:hmr:cef
   ```

3. CDP endpoint alive:
   ```bash
   curl -s http://127.0.0.1:9222/json/version
   ```

## Configuration

The repo includes `.playwright/cli.config.json` at the root:

```json
{
  "browser": {
    "cdpEndpoint": "http://127.0.0.1:9222",
    "isolated": false
  }
}
```

playwright-cli auto-discovers this file when run from the repo root (or any subdirectory that resolves to it). No `--config` flag needed.

| Field | Purpose |
|-------|---------|
| `cdpEndpoint` | CDP endpoint exposed by `dev:hmr:cef` (default port 9222) |
| `isolated` | **Must be `false`** for CEF. Tells Playwright to reuse the existing browser context instead of creating a new one. |

## Quick Start

```bash
# 1. Connect to the running app
playwright-cli open

# 2. List tabs — the app page is usually tab 1
playwright-cli tab-list

# 3. Switch to the app tab
playwright-cli tab-select 1

# 4. Take a snapshot (accessibility tree with element refs)
playwright-cli snapshot

# 5. Take a screenshot
playwright-cli screenshot

# 6. Done for now
playwright-cli close
```

After `open`, the session persists across commands. You don't need to reconnect for each command.

## Examples

### Take a screenshot of the running app

```bash
playwright-cli open
playwright-cli tab-select 1
playwright-cli screenshot --filename=app-state.png
playwright-cli close
```

### Inspect the DOM

`snapshot` returns an accessibility-tree representation with element reference IDs (like `e5`, `e12`) that you can use with `click`, `fill`, etc.

```bash
playwright-cli snapshot
```

Output looks like:

```
- Page URL: http://localhost:5174/
- Page Title: React + Tailwind + Vite

[ref=e1] heading "Cortex Chat"
[ref=e2] button "New Chat"
[ref=e5] textbox "Message..."
...
```

### Fill and submit a form

```bash
# Open and switch to app tab
playwright-cli open
playwright-cli tab-select 1

# Find the message input (check refs with snapshot first)
playwright-cli snapshot

# Fill the input and submit
playwright-cli fill e5 "What is 2 + 2?"
playwright-cli press Enter

# Wait for response, then screenshot
playwright-cli screenshot --filename=after-submit.png
playwright-cli close
```

The exact element ref (`e5`) depends on the current page state — always run `snapshot` first to get the right refs.

### Read console logs

```bash
playwright-cli console
# Or filter by level:
playwright-cli console warning
```

### Evaluate JavaScript

```bash
# Get the page title
playwright-cli eval "document.title"

# Query a specific element
playwright-cli eval "el => el.textContent" e5

# Run arbitrary page-context JS
playwright-cli eval "document.querySelectorAll('.chat-message').length"
```

### Multi-tab workflow

CEF apps may have multiple pages (e.g. `about:blank` + the app page):

```bash
playwright-cli tab-list
# Output:
# - 0: [](about:blank)
# - 1: (current) [React + Tailwind + Vite](http://localhost:5174/)

playwright-cli tab-select 1
```

### Network and tracing

```bash
# List network requests
playwright-cli network

# Record a trace
playwright-cli tracing-start
# ... interact with the app ...
playwright-cli tracing-stop
```

## Script Examples

These bash scripts show how to compose playwright-cli commands into repeatable workflows.

### Screenshot script

Captures the current app UI. Run from the repo root.

```bash
#!/usr/bin/env bash
set -euo pipefail

OUTPUT="${1:-output/playwright/cdp-chat.png}"
mkdir -p "$(dirname "$OUTPUT")"

playwright-cli open
playwright-cli tab-select 1
playwright-cli screenshot --filename="$OUTPUT"
playwright-cli close

echo "Screenshot saved: $OUTPUT"
```

### Smoke test script

Submits a prompt, waits for the assistant response, and captures a screenshot.

```bash
#!/usr/bin/env bash
set -euo pipefail

PROMPT="${1:-Give a two-bullet markdown response confirming you are live.}"
OUTPUT="${2:-output/playwright/cdp-smoke.png}"
mkdir -p "$(dirname "$OUTPUT")"

playwright-cli open
playwright-cli tab-select 1

# Take a snapshot to find the message input ref
playwright-cli snapshot --filename=_smoke-before.yaml

# Fill the prompt and submit
playwright-cli fill e5 "$PROMPT"     # ref may vary — check snapshot
playwright-cli press Enter

# Wait for the response to render, then capture
sleep 5
playwright-cli screenshot --filename="$OUTPUT"

# Print the last assistant message
playwright-cli eval "(() => {
  const msgs = document.querySelectorAll('[data-testid=\"chat-message\"][data-role=\"assistant\"]');
  const last = msgs[msgs.length - 1];
  return last?.innerText?.trim()?.slice(0, 280) ?? '(no response)';
})()"

playwright-cli close
echo "Screenshot saved: $OUTPUT"
```

### Tool matrix script

Exercises multiple tool types in the chat app: success, error, subagent, and approval flows. Each step submits a prompt, waits for specific UI text, and captures a screenshot.

```bash
#!/usr/bin/env bash
set -euo pipefail

OUT="${1:-output/playwright/tool-matrix}"
mkdir -p "$OUT"

playwright-cli open
playwright-cli tab-select 1

# Start fresh
playwright-cli click e2   # "New Chat" button (check snapshot for actual ref)
sleep 2

# --- 1. Root success tool ---
playwright-cli snapshot --filename=_matrix-pre1.yaml
playwright-cli fill e5 'Use get_local_time with timezone "Europe/Copenhagen" and report the result.'
playwright-cli press Enter
sleep 10
playwright-cli screenshot --filename="$OUT/01-root-get-local-time.png"

# --- 2. Root error tool ---
playwright-cli snapshot --filename=_matrix-pre2.yaml
playwright-cli fill e5 'Call always_fail_for_test with reason "smoke".'
playwright-cli press Enter
sleep 10
playwright-cli screenshot --filename="$OUT/02-root-fail-tool.png"

# --- 3. Subagent math tool ---
playwright-cli snapshot --filename=_matrix-pre3.yaml
playwright-cli fill e5 "What is 12.5 * (8 - 3)?"
playwright-cli press Enter
sleep 10
# Expand the Agent activity details
playwright-cli snapshot --filename=_matrix-post3.yaml
playwright-cli screenshot --filename="$OUT/03-subagent-solve-arithmetic.png"

# --- 4. Approval tool (deny) ---
playwright-cli snapshot --filename=_matrix-pre4.yaml
playwright-cli fill e5 "Preview deleting prod invoices using sensitive_action_preview."
playwright-cli press Enter
sleep 10
playwright-cli snapshot --filename=_matrix-approval4.yaml
# Click "Deny" (find the deny button ref from snapshot)
# playwright-cli click <deny-ref>
sleep 2
playwright-cli screenshot --filename="$OUT/04-approval-denied.png"

# --- 5. Approval tool (approve) ---
playwright-cli snapshot --filename=_matrix-pre5.yaml
playwright-cli fill e5 "Preview deleting prod invoices using sensitive_action_preview again."
playwright-cli press Enter
sleep 10
playwright-cli snapshot --filename=_matrix-approval5.yaml
# Click "Approve" (find the approve button ref from snapshot)
# playwright-cli click <approve-ref>
sleep 2
playwright-cli screenshot --filename="$OUT/05-approval-approved.png"

playwright-cli close
echo "Tool matrix screenshots saved to $OUT/"
```

Note: The approval steps (4 and 5) have the `click` lines commented out because the deny/approve button refs are dynamic — you need to read the snapshot output and fill in the correct ref. When a coding agent runs this, it can parse the snapshot and fill them in automatically.

## Troubleshooting

### `browserContext.newPage: Cannot read properties of undefined (reading '_page')`

The `isolated` config is missing or set to `true`. Ensure `.playwright/cli.config.json` has `"isolated": false`. Then restart the session:

```bash
playwright-cli close
playwright-cli open
```

### `The browser 'default' is not open, please run open first`

Run `playwright-cli open` before any other command. The session may have been closed or the daemon may have died.

### Stale daemon / socket errors

Kill all daemon processes and start fresh:

```bash
playwright-cli kill-all
playwright-cli open
```

### CDP endpoint not reachable

Confirm the app is running in CEF mode:

```bash
curl -s http://127.0.0.1:9222/json/version
```

If this fails, restart the app with `bun run dev:hmr:cef`. Check for port conflicts on 9222.

### Only one app at a time

CEF mode uses port 9222 by default. Only one `dev:hmr:cef` session can run at a time across all apps. Stop other CEF sessions before starting a new one.

### Tab shows `about:blank` instead of the app

The app page is usually tab 1, not tab 0. Run `playwright-cli tab-list` and select the tab with the `localhost:5174` URL.

## Reference

Full command list: `playwright-cli --help`

Key commands:

| Command | Description |
|---------|-------------|
| `open` | Connect to CDP and start session |
| `close` | End session and disconnect |
| `tab-list` | List all open tabs |
| `tab-select <n>` | Switch to tab by index |
| `snapshot` | Accessibility tree with element refs |
| `screenshot` | Capture viewport as PNG |
| `click <ref>` | Click an element by ref |
| `fill <ref> <text>` | Fill a text input |
| `type <text>` | Type text into focused element |
| `press <key>` | Press a keyboard key |
| `eval <js> [ref]` | Evaluate JS in page context |
| `console [level]` | Read console messages |
| `network` | List network requests |
| `kill-all` | Force-kill all daemon processes |
