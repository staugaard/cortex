# template-electrobun

Minimal Electrobun app template. Copy this to create new apps in the monorepo.

## Directory Layout

- `src/bun/` — Native process code (Bun runtime, `electrobun/bun` APIs). No DOM.
- `src/mainview/` — Webview code (React, browser context, `electrobun/view`). No Bun/Node APIs.
- `src/mainview/types.ts` — Shared RPC schema type used by both sides.

## Runtime Boundary Rules

- Webview-safe code (`src/mainview/`) must not import Bun-only APIs.
- Bun code (`src/bun/`) must not depend on DOM or browser globals.
- All communication between native and webview goes through the typed RPC bridge.

## RPC Pattern

The RPC schema is defined in `src/mainview/types.ts` as `AppSchema`. Both sides reference it:
- Bun side: `src/bun/rpc.ts` — `BrowserView.defineRPC<AppSchema>({...})`
- Webview side: `src/mainview/rpc.ts` — `Electroview.defineRPC<AppSchema>({...})`

To add a new RPC method:
1. Add the type to `AppSchema` in `types.ts`
2. Add the handler in the appropriate `rpc.ts`

## Running and Testing the UI

Start the app with HMR:
```sh
bun run --cwd apps/template-electrobun dev:hmr
```

This opens a native desktop window showing the React webview. Vite HMR is active on port 5174 — edits to `src/mainview/` files reflect instantly in the running window without restarting.

Changes to `src/bun/` (native process) require restarting the app.

**Do NOT open `http://localhost:5174` in a standalone browser to test the app.** The Electroview RPC bridge requires Electrobun-injected globals that only exist inside the native shell. A regular browser tab will fail on RPC bootstrap and show a blank/broken page.

Direct interaction with the running app window is first-class and preferred. CDP scripts are optional helpers.

## Automation Mode (For Coding Agents)

When you need screenshots or scripted verification, use CEF mode with CDP:

1. Start with CEF renderer:
   ```sh
   bun run --cwd apps/template-electrobun dev:hmr:cef
   ```

2. Verify the CDP endpoint:
   ```sh
   bun run --cwd apps/template-electrobun cdp:check
   ```

3. Capture a screenshot:
   ```sh
   bun run --cwd apps/template-electrobun cdp:screenshot
   ```
   Saves to `output/playwright/screenshot.png`.

Use CDP-aware tools (Playwright `chromium.connectOverCDP`) to attach to the running embedded webview — not a standalone browser tab. See `scripts/cdp-screenshot.mjs` for the implementation.

## Validation

```sh
bun run --cwd apps/template-electrobun typecheck
```

## Adding shadcn/ui Components

```sh
cd apps/template-electrobun
bunx shadcn@latest add <component>
```

Components install to `src/mainview/components/ui/`. The `components.json` and `lib/utils.ts` are pre-configured.

## Change Checklist

1. Keep code in the correct runtime boundary (`src/bun/` vs `src/mainview/`).
2. Update `AppSchema` in `types.ts` when adding RPC methods.
3. Run `typecheck` before finishing.
