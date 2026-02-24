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
bun run typecheck
bun run cdp:check
bun run cdp:targets
bun run cdp:screenshot
bun run cdp:smoke
bun run cdp:llm
```

## Agent Routing

Default behavior uses a root manager agent that decides whether to:

- answer directly, or
- call a specialist `ask_math_expert` subagent tool for math-heavy requests.

## In-Conversation Agent Activity

Assistant messages include an `Agent activity` item:

- collapsed by default
- expandable to show manager/subagent timeline
- persisted with conversation messages and restored on reload

## Structure

- `src/bun/chat-rpc.ts`: Bun RPC handlers + stream orchestration
- `src/bun/chat-agent.ts`: manager/subagent orchestration and activity recording
- `src/mainview/App.tsx`: conversation rendering including activity/tool parts
- `src/mainview/components/AgentActivityItem.tsx`: collapsed/expanded activity UI
