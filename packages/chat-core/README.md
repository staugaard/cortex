# @cortex/chat-core

Shared chat infrastructure for Cortex desktop apps.

## Subpath Exports

- `@cortex/chat-core/rpc`
- `@cortex/chat-core/transport-web`
- `@cortex/chat-core/transport-bun`
- `@cortex/chat-core/persistence`
- `@cortex/chat-core/agents`

## Runtime Boundary

- `transport-web` is webview-safe.
- `transport-bun`, `persistence`, and `agents` are Bun/runtime-side.
- `rpc` is runtime-agnostic.

## Agents Utilities

`@cortex/chat-core/agents` provides reusable Bun-side helpers for manager/subagent orchestration:

- `runSubagentUIMessageStream(...)`
- `composeAgentLoopHooks(...)`
- `createAgentLoopInstrumentation(...)`
- `createAgentActivityRecorder(...)`

These utilities are intentionally app-agnostic. Product prompts and domain-specific tools stay in each app.

## Validation

From repo root:

```bash
bun run typecheck:chat-core
bun run typecheck:chat
bun run typecheck:phase1
```

When modifying `packages/chat-core`:

```bash
bun run --cwd packages/chat-core test
```
