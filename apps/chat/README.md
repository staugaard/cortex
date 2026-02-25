# Cortex Chat Kitchen Sink (`apps/chat`)

Kitchen-sink Electrobun app used to validate shared `@cortex/chat-core` behavior.

For reliable in-app automation and LLM verification, use:
- `docs/automation-runbook.md`

## Getting Started

```bash
# from repo root
bun install

# from apps/chat
cp .env.example .env
# set ANTHROPIC_API_KEY in .env

bun run dev:hmr
```

## Development Commands

```bash
bun run dev
bun run dev:hmr
bun run dev:hmr:cef
bun run dev:stop
bun run typecheck
bun run cdp:check
bun run cdp:targets
bun run check:shared-chat-adoption
```

## Agent Routing

Default behavior uses a root manager agent that decides whether to:

- answer directly, or
- call a specialist `ask_math_expert` subagent tool for math-heavy requests.

Test tools configured in this app:
- Root: `get_local_time`, `always_fail_for_test`, `sensitive_action_preview` (`needsApproval: true`)
- Subagent: `solve_arithmetic`

Rendering contract:
- root/model tool calls render in the main chat timeline
- internal delegation tool plumbing (`ask_math_expert`) is hidden by backend normalization
- `Agent activity` appears only when a real delegated subagent run occurs
- `sensitive_action_preview` uses real AI SDK approval flow via in-chat Approve/Deny controls
- Anthropic reasoning is enabled and streamed as AI SDK `reasoning` parts, rendered inline in chat

## Shared Chat Adoption Guard

- `apps/chat` conversation/session UI must be wired through `@cortex/chat-core/react`.
- Enforcement check:
  - `bun run check:shared-chat-adoption`

## In-Conversation Agent Activity

Assistant messages include an `Agent activity` item:

- collapsed by default
- expandable to show manager/subagent timeline
- persisted with conversation messages and restored on reload

## Structure

- `src/bun/chat-rpc.ts`: Bun RPC handlers + stream orchestration
- `src/bun/chat-agent.ts`: manager/subagent orchestration and activity recording
- `src/mainview/App.tsx`: app shell + shared conversation/session wiring
- `src/mainview/chat-session-store.ts`: RPC-backed `ChatSessionStore` adapter
