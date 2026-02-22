# Shared Chat Core Package Specification

## Summary

This repository will host multiple desktop chat applications built with Electrobun, Bun, React, and AI SDK.  
To avoid repeated implementation and drift, we will create one shared package that contains reusable chat infrastructure.

The package is a foundation layer, not a full product layer.  
Apps keep their own product behavior and UI composition, while sharing transport, orchestration patterns, and persistence primitives.

## Problem Statement

Without a shared package, each app will independently reimplement:

- Bun-to-webview streaming transport
- agent run lifecycle handling
- conversation persistence and loading
- common tool and subagent wiring patterns
- token and usage tracking scaffolding

This creates four direct risks:

- duplicate code with inconsistent behavior between apps
- fragile bug fixes because fixes must be replicated manually
- inconsistent type contracts between backend and frontend
- slower feature rollout as app count grows

## Goals

- Define one shared package that is reusable across all chat-enabled apps in the monorepo.
- Preserve strict runtime boundaries between Bun-only and webview-safe code.
- Standardize stream contracts and message persistence format.
- Keep AI SDK as the only orchestration and streaming abstraction.
- Make adoption incremental so the first app can migrate without a large rewrite.

## Non-Goals

- Centralize all app UI in the shared package at this stage.
- Force one global manager prompt or one universal tool set for every app.
- Introduce an HTTP layer for local chat transport by default.
- Solve every future feature now (for example full analytics, full tracing pipeline, or multi-device sync).

## Proposed Solution

Create one package at:

- `/Users/staugaard/Code/cortex/packages/chat-core`

Expose runtime-specific modules via subpath exports so apps only import what they can execute safely.

### Why One Package with Subpaths

One package keeps dependency management and versioning simple for this early monorepo stage.  
Subpaths enforce explicit boundaries, so browser code cannot accidentally import Bun APIs and Bun code cannot rely on webview-only modules.

## Package Boundaries

Initial subpaths:

- `@cortex/chat-core/rpc`
- `@cortex/chat-core/transport-bun`
- `@cortex/chat-core/transport-web`
- `@cortex/chat-core/persistence`
- `@cortex/chat-core/agents`

### Runtime Rules

- `transport-web` must be webview-safe and contain no `bun:*` imports.
- `transport-bun`, `persistence`, and Bun agent runners may use Bun APIs.
- `rpc` types are shared and runtime-agnostic.
- `agents` should expose reusable factories and helpers, not app-specific business prompts.

## What Lives in the Shared Package

### 1) Shared RPC Contracts (`rpc`)

Defines typed request/message contracts for chat runs and persistence calls.

Illustrative shape:

```ts
export type StartAgentRunMessage = {
  chatId: string;
  messages: UIMessage[];
  agentId?: string;
};

export type AgentChunkMessage = {
  chatId: string;
  chunk: UIMessageStreamPart;
};
```

### 2) Bun-Side Streaming Bridge (`transport-bun`)

Converts `agent.stream(...).toUIMessageStream()` into RPC chunk messages, including done and error events.

Illustrative shape:

```ts
export async function runAgentAndStreamToWebview(input: {
  chatId: string;
  agent: Agent;
  messages: UIMessage[];
  postChunk: (msg: AgentChunkMessage) => void;
  postDone: (chatId: string) => void;
  postError: (chatId: string, error: string) => void;
}) {
  // stream AI SDK parts and forward them to the webview
}
```

### 3) Webview Transport Adapter (`transport-web`)

Provides a `ChatTransport` or compatible bridge that gives `useChat` a `ReadableStream<UIMessageStreamPart>` backed by Electrobun RPC messages.

Illustrative shape:

```ts
export function createElectrobunChatTransport(deps: {
  sendStart: (payload: StartAgentRunMessage) => void;
  sendCancel: (chatId: string) => void;
  subscribeChunk: (fn: (msg: AgentChunkMessage) => void) => () => void;
  subscribeDone: (fn: (chatId: string) => void) => () => void;
  subscribeError: (fn: (chatId: string, error: string) => void) => () => void;
}): ChatTransport {
  // return transport consumed by useChat(...)
}
```

### 4) Persistence Layer (`persistence`)

Provides Bun SQLite primitives for sessions and stored `UIMessage` arrays, plus utilities to derive model messages.

Illustrative shape:

```ts
export interface ChatRepository {
  listSessions(limit?: number): Promise<SessionSummary[]>;
  getSession(sessionId: string): Promise<{ messages: UIMessage[]; metadata: SessionMetadata }>;
  saveMessages(sessionId: string, messages: UIMessage[]): Promise<void>;
}
```

### 5) Agent Utilities (`agents`)

Reusable helpers for manager and subagent composition, including common patterns:

- streaming subagent wrapper (`readUIMessageStream` pattern)
- `toModelOutput` compaction helpers
- shared loop hooks (logging, counters, cancellation propagation)

This module should provide patterns and factories, not lock apps into one fixed prompt strategy.

## What Stays in Each App

- product-specific prompts and system behavior
- domain-specific tools and integrations
- app UI branding and specialized components
- app-level feature toggles and settings policies

This keeps app identity and experimentation local while infrastructure remains standardized.

## Development Host App (Kitchen Sink)

`/Users/staugaard/Code/cortex/apps/chat` is the kitchen-sink app for this monorepo and should be used as the primary proving ground while `chat-core` is built.

Rules for use during development:

- New shared transport and RPC work lands behind this app first.
- Persistence and agent helper APIs are exercised here before being declared stable.
- Breaking changes in `chat-core` are validated in this app in the same PR.
- This app may intentionally include extra diagnostic UI and experimental flows to stress the shared library.

## High-Level Implementation Plan

### Phase 1: Package Skeleton and Boundaries

- Create `/Users/staugaard/Code/cortex/packages/chat-core` with subpath exports.
- Establish runtime boundaries (`transport-web` vs Bun-only modules).
- Add baseline tests or type checks to prevent cross-runtime import mistakes.

### Phase 2: Streaming Transport Foundation

- Implement shared RPC contracts in `@cortex/chat-core/rpc`.
- Implement Bun-side stream forwarding in `@cortex/chat-core/transport-bun`.
- Implement webview transport adapter in `@cortex/chat-core/transport-web`.
- Integrate in `/Users/staugaard/Code/cortex/apps/chat` and verify streaming, cancel, done, and error flows.

### Phase 3: Persistence Foundation

- Implement SQLite repository primitives in `@cortex/chat-core/persistence`.
- Add session CRUD and `UIMessage[]` persistence/load flows.
- Wire persistence through `/Users/staugaard/Code/cortex/apps/chat` conversation lifecycle.

### Phase 4: Agent Utilities and Shared Patterns

- Add reusable manager/subagent helper utilities in `@cortex/chat-core/agents`.
- Add `toModelOutput` compaction helpers and shared loop instrumentation hooks.
- Validate with at least two distinct agent workflows in the kitchen-sink app.

### Phase 5: Stabilization and API Hardening

- Remove or gate unstable APIs.
- Document supported extension points and contract guarantees.
- Add regression coverage for transport, persistence, and agent helper behavior.

### Phase 6: Multi-App Adoption

- Integrate a second app using `chat-core`.
- Confirm app-specific logic stays outside shared modules.
- Refine package APIs based on real cross-app usage and finalize first stable version.

## Risks and Mitigations

- Risk: accidental cross-runtime imports.
  Mitigation: strict subpath exports and lint rules for forbidden imports.

- Risk: overgeneralizing too early.
  Mitigation: move code only after at least one real app integration.

- Risk: transport mismatch with AI SDK updates.
  Mitigation: keep transport logic minimal and centered around native AI SDK stream parts.

## Success Criteria

- New chat-enabled app can be bootstrapped with shared transport and persistence in under one day.
- No duplicate transport implementations across apps.
- Type-safe message contracts shared across Bun and webview.
- Bug fix in shared transport propagates to all apps without copy-paste changes.

## Open Questions

- Should `chat-core` expose a default repository implementation only, or both interface and implementation?
- Should model/provider selection helpers live in `agents` now, or remain app-local until two apps require shared policy?
- Do we want one schema migration path per app DB, or a shared migration layer in `persistence`?
