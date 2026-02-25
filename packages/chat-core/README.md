# @cortex/chat-core

Shared chat infrastructure for Cortex desktop apps.

## Subpath Exports

- `@cortex/chat-core/rpc`
- `@cortex/chat-core/react`
- `@cortex/chat-core/transport-web`
- `@cortex/chat-core/transport-bun`
- `@cortex/chat-core/persistence`
- `@cortex/chat-core/agents`

## Runtime Boundary

- `react` and `transport-web` are webview-safe.
- `transport-bun`, `persistence`, and `agents` are Bun/runtime-side.
- `rpc` is runtime-agnostic.

## React API

`@cortex/chat-core/react` provides:

- `ChatConversation` — default Elements-based conversation timeline + composer
- `useChatSessions` — headless session lifecycle hook with tmp-id remap semantics
- renderer extension hooks for app-specific UI parts:
  - `renderDataPart`
  - `renderToolPart`
  - `renderUnsupportedPart`
  - `renderComposer`

Example:

```tsx
import { ChatConversation } from "@cortex/chat-core/react";
```

## Tailwind Host Contract

Phase 1 does not ship a package CSS file. Host apps are expected to include source paths for `chat-core/react` components in Tailwind scanning.

At minimum, include:

- `packages/chat-core/src/react/**/*.{ts,tsx}`
- `node_modules/streamdown/dist/*.js` (when using shared markdown renderers)

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

## React Test Stack

`@cortex/chat-core/react` tests run with:

- `bun test`
- `@testing-library/react`
- `jsdom` via preload (`tests/react/setup-dom.ts`)

Legacy React renderer package usage is intentionally blocked by:

- `bun run --cwd packages/chat-core check:no-legacy-renderer`
