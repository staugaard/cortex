# NZ House Hunt Automation Runbook

This runbook is the source of truth for verifying the real Electrobun app UI during development.

## Goal
Verify behavior in the **embedded desktop webview** (not just `http://localhost:5174` in a normal browser).
Use either:
- direct unscripted interaction in the live app window, or
- CDP scripts when you want repeatability/artifacts.

## Why This Exists
`src/mainview/rpc.ts` initializes `Electroview`, which requires Electrobun-injected globals (`__electrobunWebviewId`, `__electrobunRpcSocketPort`).
A standalone browser tab does not have those globals, so RPC bootstrapping fails and the UI can appear blank/broken.

## One-Time Setup
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
Run from `apps/nz-house-hunt`.

1. Start the app:

```bash
bun run dev:hmr
```

2. Interact directly with the app window and verify:

### First-Run / Interview Flow
- on first launch (no preference profile), the interview view appears automatically
- the AI agent asks questions about rental preferences naturally
- after enough info is gathered, it calls `save_preference_profile` (hidden from UI)
- once saved, the app switches to the listings feed view
- the "Preferences" button in the header re-opens the interview with history

### Listings Feed
- listings load and display correctly
- "Run Pipeline" triggers discovery and shows results
- ratings (user/AI) display on listing cards
- refresh reloads the listing data

### Safe Interaction Sequencing (Important)
1. Wait for the app window to fully load before interacting.
2. In the interview: wait for the assistant to finish responding before sending a new message.
3. After running the pipeline, wait for completion before interacting further.

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

Quick example — interact with the interview:

```bash
playwright-cli open
playwright-cli tab-select 1
playwright-cli snapshot                          # find the message input ref
playwright-cli fill e5 "I want a 3-bed house in Ponsonby under $800/wk"
playwright-cli press Enter
playwright-cli screenshot --filename=interview.png
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
  - Ensure `apps/nz-house-hunt/.env` exists and contains `ANTHROPIC_API_KEY`.
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
