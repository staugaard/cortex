# nz-house-hunt

AI-powered NZ rental property discovery app built on `@cortex/listing-hunter` and `@cortex/chat-core`.

## Directory Layout

- `src/bun/` — Native process (Bun runtime, `electrobun/bun` APIs). No DOM.
- `src/bun/rpc.ts` — Combined RPC: listing-hunter handlers + chat-core interview handlers.
- `src/bun/listing-schema.ts` — `rentalListingSchema` extending `baseListingSchema` with NZ rental fields.
- `src/bun/trademe-tools.ts` — TradeMe source tools for the discovery pipeline.
- `src/mainview/` — Webview code (React, browser context, `electrobun/view`). No Bun/Node APIs.
- `src/mainview/App.tsx` — View routing between interview and listings feed.
- `src/mainview/InterviewView.tsx` — Chat UI for preference interview using `ChatConversation`.
- `src/mainview/types.ts` — `AppSchema` combining listing-hunter + chat-core RPC types.
- `scripts/` — Dev tooling scripts (shutdown, etc.).
- `docs/automation-runbook.md` — Required workflow for real in-app UI automation and verification.

## Runtime Boundary Rules

- Webview-safe code (`src/mainview/`) must not import Bun-only APIs.
- Bun code (`src/bun/`) must not depend on DOM or browser globals.
- All communication between native and webview goes through the typed RPC bridge.

## Key Patterns

- **AppSchema** in `types.ts` merges `ListingHunterBunRequests` with chat-core RPC types (getConversation, saveMessages, hasPreferenceProfile, startAgentRun, cancelAgentRun).
- **Interview agent** is created per-run in `rpc.ts` to pick up the latest preference profile.
- **`save_preference_profile` tool** is hidden from the UI stream via `normalizeAgentUIChunkStream`.
- **First-run detection** via `hasPreferenceProfile` RPC — if no profile, show interview view.
- **Interview uses fixed chatId `"interview"`** — single session, resumable across restarts.

## Running and Testing the UI

Start the app with HMR:
```sh
bun run --cwd apps/nz-house-hunt dev:hmr
```

**Do NOT open `http://localhost:5174` in a standalone browser.** The Electroview RPC bridge requires Electrobun-injected globals that only exist inside the native shell.

Direct interaction with the running app window is first-class and preferred.

## Automation Mode (For Coding Agents)

1. Start with CEF renderer:
   ```sh
   bun run --cwd apps/nz-house-hunt dev:hmr:cef
   ```

2. Verify the CDP endpoint:
   ```sh
   bun run --cwd apps/nz-house-hunt cdp:check
   ```

3. Use `playwright-cli` for interactive automation. See `/docs/playwright-cli-guide.md`.

4. Clean shutdown:
   ```sh
   bun run --cwd apps/nz-house-hunt dev:stop
   ```

For the full verification workflow, see `docs/automation-runbook.md`.

## Validation

```sh
bun run --cwd apps/nz-house-hunt typecheck
```

When changing `packages/listing-hunter`, also run:
```sh
bun run --cwd packages/listing-hunter test
```

## Change Checklist

1. Keep code in the correct runtime boundary (`src/bun/` vs `src/mainview/`).
2. Update `AppSchema` in `types.ts` when adding RPC methods.
3. If subpath APIs change in listing-hunter or chat-core, update all consuming imports.
4. Run `typecheck` before finishing.
