# Electrobun App Template

Minimal Electrobun desktop app with React, Tailwind CSS v4, Vite HMR, and a typed RPC bridge between the native (Bun) process and the webview.

## What's included

- **Electrobun** desktop shell with native or CEF renderer
- **React 19** + **TypeScript** (strict mode)
- **Tailwind CSS v4** with Apple-inspired theme variables
- **Vite** dev server with HMR on port 5174
- **Typed RPC bridge** between Bun and webview (empty schema, ready to extend)
- **shadcn/ui config** (`components.json`) so you can add components on demand
- **`cn()` utility** for class merging (`clsx` + `tailwind-merge`)

## Creating a new app from this template

1. Copy the directory:
   ```sh
   cp -r apps/template-electrobun apps/my-new-app
   ```

2. Update identifiers in the new app:
   - `package.json` — change `"name"` to your app name
   - `electrobun.config.ts` — change `app.name` and `app.identifier`
   - `src/bun/index.ts` — change the `title` in `BrowserWindow`
   - `src/mainview/index.html` — change `<title>`

3. Install dependencies from the monorepo root:
   ```sh
   bun install
   ```

4. Run the app:
   ```sh
   bun run --cwd apps/my-new-app dev:hmr
   ```

## Development

Start the app with Vite HMR (recommended):

```sh
bun run --cwd apps/template-electrobun dev:hmr
```

This launches two processes concurrently:
- **Vite dev server** on `http://localhost:5174` serving the React webview with hot module replacement
- **Electrobun** native shell loading the webview from the Vite dev server

Edit files in `src/mainview/` and changes appear instantly in the running app window — no restart needed. Changes to `src/bun/` (native process) require restarting the app.

### Native renderer vs CEF

By default, Electrobun uses its native renderer. To use CEF (Chromium Embedded Framework) instead — which enables Chrome DevTools via CDP on port 9222:

```sh
bun run --cwd apps/template-electrobun dev:hmr:cef
```

### Without HMR

If you don't need HMR, `bun run dev` does a one-shot Vite build then launches Electrobun. The webview loads the built files from `dist/` instead of the dev server.

## Verifying UI in the app

### Why you can't just open localhost:5174 in a browser

The Vite dev server runs on `http://localhost:5174`, but **do not open that URL in a regular browser tab to test your app**. The Electrobun RPC bridge (`Electroview`) requires native globals (`__electrobunWebviewId`, `__electrobunRpcSocketPort`) that are injected by the Electrobun shell. A standalone browser tab does not have these globals, so the RPC bridge fails to initialize and the app will appear blank or broken.

Always verify behavior in the actual Electrobun app window.

### Direct interaction (primary workflow)

Run `bun run dev:hmr` and interact with the native app window directly. This is the fastest and most reliable way to verify UI changes during development.

### Programmatic access via CDP

When you need screenshots or scripted verification, use CEF mode with Chrome DevTools Protocol:

1. Start the app with CEF renderer:
   ```sh
   bun run dev:hmr:cef
   ```

2. Verify the CDP endpoint is alive:
   ```sh
   bun run cdp:check
   ```
   Expected: JSON output with Chrome version info.

3. List page targets:
   ```sh
   bun run cdp:targets
   ```
   Expected: JSON array with a page target for `http://localhost:5174/`.

4. Capture a screenshot of the running app:
   ```sh
   bun run cdp:screenshot
   ```
   Saves to `output/playwright/screenshot.png`.

The screenshot script uses Playwright's `chromium.connectOverCDP()` to attach to the embedded webview inside the Electrobun shell — not a standalone browser. See `scripts/cdp-screenshot.mjs` for the implementation.

Environment variables for the screenshot script:
- `CDP_ENDPOINT` (default: `http://127.0.0.1:9222`)
- `CDP_SCREENSHOT` (default: `output/playwright/screenshot.png`)
- `CDP_WAIT_MS` (default: `1000`) — delay before capturing

## Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Build webview + start Electrobun (no HMR) |
| `bun run dev:hmr` | Vite HMR + Electrobun dev (recommended) |
| `bun run dev:cef` | Build + start with CEF renderer (CDP on port 9222) |
| `bun run dev:hmr:cef` | HMR + CEF renderer |
| `bun run build` | Production build (Vite + Electrobun) |
| `bun run typecheck` | TypeScript type checking |
| `bun run cdp:check` | Verify CDP endpoint is alive (requires CEF mode) |
| `bun run cdp:targets` | List CDP page targets |
| `bun run cdp:screenshot` | Capture screenshot of running app via CDP |

## Directory structure

```
src/
├── bun/                 # Native process (Bun runtime)
│   ├── index.ts         # App entry: BrowserWindow + HMR detection
│   └── rpc.ts           # RPC handler registration (Bun side)
└── mainview/            # Webview (React, runs in browser context)
    ├── index.html       # HTML entry point
    ├── main.tsx         # React bootstrap + RPC bridge init
    ├── App.tsx          # Root component (blank page)
    ├── index.css        # Tailwind + theme variables
    ├── rpc.ts           # RPC bridge (webview side)
    ├── types.ts         # Shared RPC schema type
    └── lib/
        └── utils.ts     # cn() class merge utility
```

## Adding shadcn/ui components

The `components.json` is pre-configured. Add components with:

```sh
cd apps/my-new-app
bunx shadcn@latest add button
bunx shadcn@latest add dialog
```

Components are installed to `src/mainview/components/ui/`.

## Adding RPC methods

1. Define the types in `src/mainview/types.ts` (the `AppSchema` type)
2. Implement handlers in `src/bun/rpc.ts` (for bun-side handlers) or `src/mainview/rpc.ts` (for webview-side handlers)
3. Call from the other side using the typed `appRpc` object

## Runtime boundaries

- **`src/bun/`** runs in Bun — can use file system, `electrobun/bun` APIs, and Node built-ins. Cannot use DOM or browser globals.
- **`src/mainview/`** runs in the webview — can use DOM, React, and `electrobun/view`. Cannot use Bun or Node APIs.
- The RPC bridge is the only communication channel between the two.
