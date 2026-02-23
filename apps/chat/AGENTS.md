# AGENTS.md

## Scope
These instructions apply to `/Users/staugaard/Code/cortex/apps/chat`.

## Purpose
`apps/chat` is the kitchen-sink host for validating shared chat-core behavior. It is allowed to include diagnostics and experimental flows needed to test `@cortex/chat-core`.

## Architecture
- Bun process entry: `/Users/staugaard/Code/cortex/apps/chat/src/bun/index.ts`
- Bun RPC + handlers: `/Users/staugaard/Code/cortex/apps/chat/src/bun/chat-rpc.ts`
- Agent setup: `/Users/staugaard/Code/cortex/apps/chat/src/bun/chat-agent.ts`
- Temporary persistence store: `/Users/staugaard/Code/cortex/apps/chat/src/bun/chat-memory-store.ts`
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
- Markdown rendering for assistant/user text uses `streamdown`.
- Non-text message parts should be rendered explicitly (or clearly surfaced as typed placeholders) rather than silently ignored.

## Commands
Run inside this workspace:
- `bun run dev:hmr`
- `bun run dev`
- `bun run typecheck`

## Manual Validation (when transport/UI behavior changes)
1. Happy path streaming: submit a prompt and verify incremental assistant output.
2. Cancel behavior: stop an in-flight response and verify clean reset.
3. Error path: invalid/missing API key surfaces an error without hanging.
4. Persistence path: save and reload session messages from the in-memory handlers.
5. Concurrency: start a second run and verify older run output is not applied.
