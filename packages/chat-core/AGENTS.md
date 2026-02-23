# AGENTS.md

## Scope
These instructions apply to `/Users/staugaard/Code/cortex/packages/chat-core`.

## Mission
`@cortex/chat-core` is shared infrastructure for chat-enabled apps. Keep APIs stable, runtime boundaries explicit, and behavior well tested.

## Public Surface
Maintain subpath exports in `/Users/staugaard/Code/cortex/packages/chat-core/package.json`:
- `@cortex/chat-core`
- `@cortex/chat-core/rpc`
- `@cortex/chat-core/transport-web`
- `@cortex/chat-core/transport-bun`
- `@cortex/chat-core/persistence`
- `@cortex/chat-core/agents`

Avoid introducing app-specific business logic into this package.

## Runtime Boundary Contract
- `src/rpc/**`: runtime-agnostic types only.
- `src/transport-web/**`: browser-safe only; no Bun-only imports.
- `src/transport-bun/**`, `src/persistence/**`, `src/agents/**`: Bun/runtime side.
- Preserve compile-time boundary enforcement from `src/internal/runtime-tags.ts`.

## Transport Semantics to Preserve
- Runs are keyed by `chatId` + `runId`.
- Starting a new run for the same `chatId` cancels/supersedes the old run.
- Stale chunks must be ignored.
- Cancellation must emit deterministic completion signaling (`reason: "cancelled"`).
- Errors should emit `agentError` for the active run only.

## Testing and Validation
Run in this workspace:
- `bun run typecheck:web`
- `bun run typecheck:bun`
- `bun run typecheck`
- `bun test`

Expected coverage when modifying transport code:
- normal stream completion
- cancellation behavior
- error behavior
- stale run suppression

## Implementation Guidance
- Prefer small, explicit contracts over framework-heavy abstractions.
- Keep `rpc` request/message types aligned with app integration use.
- Add new exports deliberately; avoid leaking internals from root export unless intended as public API.
- If behavior changes, update tests and `apps/chat` integration in the same change.
