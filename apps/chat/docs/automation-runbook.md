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

- Clean shutdown for app testing sessions:

```bash
bun run dev:stop
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
- no shared conversation error banner appears during normal sends/switches
- load-error banner only appears when load operations fail
- reloading the same session restores persisted messages
- generated session title upgrades from fallback to a concise final title
- assistant messages include an `Agent activity` item that is collapsed by default
- root tool calls (non-internal tools) render in the chat timeline
- reasoning output appears as a collapsible `Reasoning` section when the model emits it

### Safe Interaction Sequencing (Important)
Use this order to avoid false negatives caused by lifecycle races:

1. New chat:
- click `New Chat`
- wait for empty-state text (`Send a message to get started`)
- verify a new provisional chat appears in the session rail before first send

2. First send:
- submit prompt
- wait for first assistant response to appear
- wait until composer is back in `Submit` state (not `Stop`) before next turn

3. Multi-turn:
- only send next prompt after previous turn is fully done
- if diagnosing mid-stream behavior, verify composer control transitions (`Stop` -> `Submit`)

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
- verify no `Agent activity` item is rendered for that turn

2. Math-specialist path:
- send a math prompt (for example `Solve 17*(24-9)`)
- verify `Agent activity` expands to show math-expert subagent events
- verify `ask_math_expert` is not rendered as a standalone tool card in the chat timeline

### Tool Matrix Validation

Use deterministic prompts that strongly bias tool selection:

1. Root success tool:
- prompt: `Use get_local_time for timezone Europe/Copenhagen and report the result.`
- expect: tool card for `get_local_time` with `output-available`

2. Root error tool:
- prompt: `Call always_fail_for_test with reason smoke.`
- expect: tool card for `always_fail_for_test` with `output-error`

3. Subagent arithmetic tool:
- prompt: `What is 12.5 * (8 - 3)?`
- expect: one `Agent activity` item; inside expanded activity, `solve_arithmetic` appears
- expect: no root-level `ask_math_expert` tool card

4. Approval tool:
- prompt: `Preview deleting prod invoices using sensitive_action_preview.`
- expect: tool card enters `approval-requested` with Approve/Deny controls
- click `Deny` and expect `output-denied`
- repeat with `Approve` and expect `output-available`

5. Reasoning visibility:
- prompt: `Think step by step and then answer: what is 27*14?`
- expect: at least one assistant `Reasoning` item appears (collapsible)

6. Shared chat adoption check:
- run `bun run check:shared-chat-adoption`
- expect success and no legacy app-local conversation renderer stack

3. If you need scriptable checks or screenshots, switch to CEF/CDP mode:

```bash
bun run dev:hmr:cef
```

## Interactive CLI Verification (playwright-cli)

For interactive automation (screenshots, DOM inspection, form filling), use `playwright-cli` instead of custom scripts. It connects to the running CEF app via CDP and provides a stateful session.

See the full guide: `/docs/playwright-cli-guide.md`

Quick example — screenshot the current app state:

```bash
playwright-cli open
playwright-cli tab-select 1
playwright-cli screenshot --filename=current-state.png
playwright-cli close
```

Quick example — submit a prompt and capture the result:

```bash
playwright-cli open
playwright-cli tab-select 1
playwright-cli snapshot                          # find the message input ref
playwright-cli fill e5 "What is 2 + 2?"         # ref may vary, check snapshot
playwright-cli press Enter
playwright-cli screenshot --filename=response.png
playwright-cli close
```

Notes:
- `playwright-cli close` and `playwright-cli close-all` close Playwright CLI browser sessions only.
- They do **not** stop the Electrobun app started by `bun run dev:hmr` or `bun run dev:hmr:cef`.
- Use `bun run dev:stop` to shut down both Playwright sessions and matching app dev processes.

## CDP Health Checks

These curl-based scripts remain for quick endpoint verification:

- `bun run cdp:check`: prints CDP version endpoint.
- `bun run cdp:targets`: prints active page targets.

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
  - If Playwright sessions are stale, run `playwright-cli close-all` (or `playwright-cli kill-all`) before reconnecting.

## Artifacts
Generated screenshots are written to:
- commonly `output/playwright/` relative to the execution directory

Do not commit these artifacts.
