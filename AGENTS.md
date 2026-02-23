# AGENTS.md

## Scope
These instructions apply to the entire `/Users/staugaard/Code/cortex` monorepo unless a deeper `AGENTS.md` overrides them.

## Working Agreement
- Use Bun for everything (`bun install`, `bun run ...`). Do not switch to npm/pnpm/yarn.
- Keep changes scoped to the task; avoid broad refactors unless required.
- Prefer shared logic in `/Users/staugaard/Code/cortex/packages/chat-core` when it is app-agnostic.
- Keep app-specific product behavior in each app workspace.

## Monorepo Layout
- `apps/chat`: kitchen-sink Electrobun app used to validate shared chat infrastructure.
- `packages/chat-core`: shared chat library (`@cortex/chat-core`) with runtime-specific subpaths.
- `specs`: product and architecture specs; keep implementation aligned with `shared-chat-core-package.md`.

## Runtime Boundary Rules
- Webview-safe code must not import Bun-only APIs.
- Bun/runtime code must not depend on DOM/webview globals.
- `@cortex/chat-core/rpc` should stay runtime-agnostic and shared by both sides.

## Validation Commands
From repo root:
- `bun run typecheck:chat-core`
- `bun run typecheck:chat`
- `bun run typecheck:phase1`

When changing `packages/chat-core`, also run:
- `bun run --cwd packages/chat-core test`

## Change Checklist
1. Update code in the correct runtime package/app boundary.
2. Update or add tests/typechecks with the change.
3. Run the smallest relevant validation set before finishing.
4. If subpath APIs change, update all consuming imports in `apps/chat` in the same change.
