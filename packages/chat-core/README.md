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

- `createAgentLoopUIChunkStream(...)`
- `normalizeAgentUIChunkStream(...)`
- `sanitizeUIMessagesForModelInput(...)`
- `runSubagentUIMessageStream(...)`
- `composeAgentLoopHooks(...)`
- `createAgentLoopInstrumentation(...)`
- `createAgentActivityRecorder(...)`

Normalization policy defaults:
- `hideStepLifecycleChunks: true`
- `hiddenToolNames: []`
- `sanitizeUIMessagesForModelInput(...)` drops `data-*` and `reasoning` parts, and keeps:
  - model-safe user/assistant content (`text`, `file`, `source-*`)
  - approval-continuation tool states (`approval-requested`, `approval-responded`)

This avoids replaying terminal tool/result history back into provider input while preserving AI SDK approval continuation.

These utilities are intentionally app-agnostic. Product prompts, tool visibility policy, and domain-specific tools stay in each app.

When app UIs are Elements-first, app stream wiring should explicitly enable UI parts needed by Elements renderers (for example `sendReasoning` / `sendSources` in `createUIMessageStream`).

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
