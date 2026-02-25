# AGENTS.md

## Scope
These instructions apply to `/Users/staugaard/Code/cortex/apps/chat`.

## Start Here
- For any UI verification task, follow `/Users/staugaard/Code/cortex/apps/chat/docs/automation-runbook.md`.
- Default to validating behavior in the real embedded app window directly; CDP scripts are optional helpers, not mandatory.

## Purpose
`apps/chat` is the kitchen-sink host for validating shared chat-core behavior. It is allowed to include diagnostics and experimental flows needed to test `@cortex/chat-core`.

## Architecture
- Bun process entry: `/Users/staugaard/Code/cortex/apps/chat/src/bun/index.ts`
- Bun RPC + handlers: `/Users/staugaard/Code/cortex/apps/chat/src/bun/chat-rpc.ts`
- Agent setup: `/Users/staugaard/Code/cortex/apps/chat/src/bun/chat-agent.ts`
- App-side title generator: `/Users/staugaard/Code/cortex/apps/chat/src/bun/chat-title-generator.ts`
- Shared SQLite persistence backend: `@cortex/chat-core/persistence` (wired from `chat-rpc.ts`)
- Webview bootstrap: `/Users/staugaard/Code/cortex/apps/chat/src/mainview/main.tsx`
- Web RPC bridge: `/Users/staugaard/Code/cortex/apps/chat/src/mainview/chat-rpc.ts`
- Web transport wiring: `/Users/staugaard/Code/cortex/apps/chat/src/mainview/chat-transport.ts`
- Chat UI: `/Users/staugaard/Code/cortex/apps/chat/src/mainview/App.tsx`

## Electrobun References
- Full API reference: [https://blackboard.sh/electrobun/llms.txt](https://blackboard.sh/electrobun/llms.txt)
- Getting started docs: [https://blackboard.sh/electrobun/docs/](https://blackboard.sh/electrobun/docs/)

## Runtime Rules
- Bun-side files (`src/bun/**`) can use Bun/Electrobun Bun APIs and provider credentials.
- Webview files (`src/mainview/**`) must remain browser-safe.
- Keep RPC schema types shared via `/Users/staugaard/Code/cortex/apps/chat/src/mainview/chat-types.ts` and `@cortex/chat-core/rpc`.

## AI and Model Defaults
- Provider integration is Anthropic.
- Current app model default is hardcoded in `chat-agent.ts` as `claude-sonnet-4-6`.
- `ANTHROPIC_API_KEY` must be present in the Bun process environment to stream real responses.

## UI Rules
- Chat conversation/session UI is consumed from `@cortex/chat-core/react`.
- App shell components (`SessionRail`, `Toolbar`) stay app-owned.
- Non-text message parts should be rendered explicitly (or clearly surfaced as typed placeholders) rather than silently ignored.
- The `@/` path alias resolves to `src/mainview/` (configured in `vite.config.ts` and `tsconfig.json`).

## Commands
Run inside this workspace:
- `bun run dev:hmr`
- `bun run dev`
- `bun run dev:hmr:cef` (automation mode with CEF + CDP on port `9222`)
- `bun run typecheck`
- `bun run cdp:check`
- `bun run cdp:targets`

playwright-cli (interactive, after `bun run dev:hmr:cef`):
- `playwright-cli open` (connect to CDP)
- `playwright-cli tab-select 1` (switch to app tab)
- `playwright-cli snapshot` (DOM accessibility tree with element refs)
- `playwright-cli screenshot` (capture viewport)
- `playwright-cli fill <ref> <text>` / `playwright-cli click <ref>` (interact with elements)
- `playwright-cli eval <js>` (run JS in page context)
- `playwright-cli console` (read console logs)
- `playwright-cli close` (end session)

## Automation Mode (For Coding Agents)
- Preferred mode for interactive UI automation is `playwright-cli` connected to CEF via CDP.
- Manual unscripted interaction with the running app is also valid and encouraged when it is faster/more direct.
- Start with `bun run dev:hmr:cef`.
- Verify the CDP endpoint with `bun run cdp:check`.
- For interactive work: `playwright-cli open && playwright-cli tab-select 1` to get a stateful session.
- For batch/CI: compose playwright-cli commands into bash scripts (see `/docs/playwright-cli-guide.md`).
- See `/docs/playwright-cli-guide.md` for the full guide and troubleshooting.
- Use CDP-aware tools to attach to the running embedded webview rather than opening `http://localhost:5174` in a standalone browser tab.

## Reliable Testing Practices
- Treat unscripted in-app verification as first-class; scripts are only optional accelerators.
- After `New Chat`, wait for empty-state + a provisional new entry in the session rail before first send.
- Only send next user turn after submit control returns to `Submit` (not `Stop`).
- Distinguish automation timing failures from product failures before changing code.
- Validate async title upgrades by observing push-driven UI updates (`conversationUpdated`), not polling loops.
- Always cross-check UI behavior with persistence reality when debugging save/title issues (session reload and SQLite row state).

## Manual Validation (when transport/UI behavior changes)
1. Happy path streaming: submit a prompt and verify incremental assistant output.
2. Cancel behavior: stop an in-flight response and verify clean reset.
3. Error path: invalid/missing API key surfaces an error without hanging.
4. Persistence path: save and reload session messages from SQLite-backed handlers.
5. Concurrency: start a second run and verify older run output is not applied.
