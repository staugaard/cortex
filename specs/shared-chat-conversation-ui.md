# Shared Chat Conversation UI Specification

## Summary

We will add a reusable webview chat conversation UI layer to `@cortex/chat-core` so apps can ship a complete AI chat experience out of the box while still rendering domain-specific rich blocks inside chat.

This work introduces a new subpath export:

- `@cortex/chat-core/react`

The shared UI will include conversation timeline, composer, streaming state handling, tool approval flow, and session lifecycle orchestration (load/save/switch/tmp-id remap). App shell and product-specific behavior remain app-owned.

## Motivation

Current state:

- `@cortex/chat-core` provides transport, RPC contracts, persistence, and agent utilities.
- `apps/chat` owns the entire conversation UI and session orchestration.
- `apps/nz-house-hunt` and future apps cannot reuse a polished chat view without copying large app code.

Planned need:

- `listing-hunter` Phase 4 requires an interview chat UI.
- Later phases require a feed-aware chat where rich listing cards appear inline in chat.

Without a shared UI layer, new apps will duplicate message rendering, session state handling, and tool approval UX.

## Goals

- Provide a polished, default chat conversation UI that works with minimal setup.
- Support app-specific rich in-chat blocks (for example listing cards) via typed extension points.
- Reuse existing `chat-core` transport/persistence semantics and preserve run correctness.
- Keep strict runtime boundaries (webview-safe only in the React layer).
- Keep adoption incremental: migrate `apps/chat` first, then use in `listing-hunter`.

## Non-Goals

- Moving full app shell into `chat-core` (session rail, diagnostics panels, toolbar, product branding).
- Centralizing app prompts, tool sets, or domain logic.
- Replacing app-level routing/layout/state outside conversation surfaces.
- Adding Bun-only logic to the React export.

## Package Surface

### New subpath export

- `@cortex/chat-core/react`

### Existing exports retained

- `@cortex/chat-core/rpc`
- `@cortex/chat-core/transport-web`
- `@cortex/chat-core/transport-bun`
- `@cortex/chat-core/persistence`
- `@cortex/chat-core/agents`

## UI Implementation Strategy (Elements + shadcn in a library)

Using AI SDK Elements and shadcn-style component code inside `@cortex/chat-core/react` is acceptable and intended.

Decision:

- Vendor generated UI/component source into `chat-core` (do not require consuming apps to run shadcn generators).
- Treat `chat-core/react` as an opinionated UI package with extension hooks, not just headless hooks.

Rules:

- Keep vendored files package-local under `packages/chat-core/src/react/components/**`.
- Do not use app-specific import aliases like `@/`; use package-local relative imports.
- Phase 1 uses a full parity vendor copy of current `apps/chat` ai-elements/ui files.
- Avoid importing Bun/Node/Electrobun Bun APIs from any React/UI file.
- Keep app shell components out of this package.

## Proposed React API

The API should ship one opinionated default component plus lower-level hooks for custom layout.

### 1) Session store adapter

```ts
export interface ChatSessionStore<UI_MESSAGE> {
  listSessions(input?: { limit?: number }): Promise<{
    sessions: Array<{
      sessionId: string;
      title?: string;
      createdAt: number;
      updatedAt: number;
    }>;
  }>;
  getSession(input: { sessionId: string }): Promise<{
    session: {
      sessionId: string;
      title?: string;
      createdAt: number;
      updatedAt: number;
      messages: UI_MESSAGE[];
    } | null;
  }>;
  saveSession(input: { sessionId: string; messages: UI_MESSAGE[] }): Promise<{
    sessionId: string;
    savedAt: number;
  }>;
  subscribeSessionUpdated?: (
    handler: (session: {
      sessionId: string;
      title?: string;
      createdAt: number;
      updatedAt: number;
    }) => void,
  ) => () => void;
}
```

### 2) Headless session lifecycle hook

```ts
export function useChatSessions<UI_MESSAGE>(input: {
  store: ChatSessionStore<UI_MESSAGE>;
  createTemporarySessionId?: () => string;
}): {
  sessions: SessionSummary[];
  activeSessionId: string;
  isSwitchingSession: boolean;
  loadError: string | null;
  saveError: string | null;
  setMessagesForActiveSession(messages: UI_MESSAGE[]): void;
  createNewSession(): Promise<void>;
  selectSession(sessionId: string): Promise<void>;
  reloadActiveSession(): Promise<void>;
  persistActiveSession(): Promise<string>;
};
```

Behavioral contract:

- Preserve current `tmp:` remap semantics from persistence.
- Preserve current canonical-id hydration behavior after remap.
- Merge push updates (`conversationUpdated`) without polling.
- Keep save path failure-safe and non-blocking for title generation.

### 3) Default conversation component

```ts
export function ChatConversation<UI_MESSAGE>(props: {
  chatId: string;
  transport: ChatTransport<UI_MESSAGE>;
  messages: UI_MESSAGE[];
  onMessagesChange: (messages: UI_MESSAGE[]) => void;
  onPersistRequest?: (messages: UI_MESSAGE[]) => Promise<void>;
  placeholder?: string;
  className?: string;

  // extension points
  renderDataPart?: ChatDataPartRenderer<UI_MESSAGE>;
  renderToolPart?: ChatToolPartRenderer<UI_MESSAGE>;
  renderUnsupportedPart?: ChatUnsupportedPartRenderer<UI_MESSAGE>;
  onToolApproval?: (input: { approvalId: string; approved: boolean }) => Promise<void> | void;
});
```

Default behavior:

- Uses `useChat` with provided transport.
- Renders text/reasoning/tool/dynamic-tool parts with default Elements-based renderers.
- Includes approval request controls for tool calls.
- Includes prompt composer with submit/stop state.
- Emits graceful fallback for unsupported parts.

## Rich App-Specific Blocks

Apps can render custom blocks via data parts.

Example:

- Agent emits `data-listingCard` with structured listing payload.
- Listing app registers renderer for `listingCard`.
- Shared conversation renders default parts plus custom listing cards inline.

Renderer model:

```ts
type ChatDataPartRenderer<UI_MESSAGE> = (input: {
  part: UI_MESSAGE["parts"][number];
  message: UI_MESSAGE;
  messageIndex: number;
}) => ReactNode | null;
```

Rules:

- If custom renderer returns `null`, shared default data-part handling applies.
- Renderer failures must not break chat; they fall back to unsupported-part UI.
- Custom renderers are pure presentation; business actions call app-provided handlers.

## UI Composition Boundaries

### Shared in `@cortex/chat-core/react`

- Conversation timeline container
- Message rendering for common AI SDK part types
- Reasoning renderer
- Tool renderer + approval controls
- Prompt input (submit/stop)
- Optional default error banner
- Headless session hook

### App-owned

- Shell layout around conversation (left rail, top bar, diagnostics, tabs)
- Product branding and theme policies
- Domain/system prompts and tool availability
- Domain-specific block renderers and actions

## Runtime and Dependency Rules

- `@cortex/chat-core/react` must be webview-safe.
- No `bun:*`, `electrobun/bun`, or Node-only imports in React subpath.
- `transport-bun`, `persistence`, and `agents` remain Bun/runtime side.
- React/UI dependency policy:
  - Use `peerDependencies` for `react`, `react-dom`, `@ai-sdk/react`, and `ai`.
  - Keep package `dependencies` to UI/runtime helpers actually used by shared components.
  - Do not bundle a second React instance via transitive hard dependencies.

## Styling Contract

`@cortex/chat-core/react` should be easy out-of-the-box but not force one global app theme.

Contract:

- Do not ship a package CSS entry in Phase 1.
- Shared components continue to use Tailwind classes and host-provided tokens/utilities.
- Consuming apps may:
  - include package source paths in Tailwind `@source`/content scanning, and
  - provide equivalent token values and component classes in app styles.
- Document required host `@source` paths and token assumptions.

## Implementation Plan

### Phase 1: React Surface in chat-core

- Add `./react` export.
- Add web-only typecheck coverage for `src/react/**`.
- Add vendored Elements/UI primitives under `src/react/components/**`.
- Implement `useChatSessions` hook with existing persistence semantics.
- Implement `ChatConversation` with default part renderers.

### Phase 2: Kitchen-Sink Adoption

- Directly migrate `apps/chat` to consume shared hook/component (no feature flag/parallel route in this phase).
- Keep app shell components (`SessionRail`, `Toolbar`) local.
- Remove app-local diagnostics and error toast shell for this phase, using shared conversation error UI.
- Add default `data-agentActivity` rendering in `@cortex/chat-core/react`.
- Verify behavior parity: streaming, cancel, approvals, save/load, remap, conversationUpdated.

### Phase 3: Listing Hunter First Product Use

- Build `InterviewChat` in `@cortex/listing-hunter/react` using shared component.
- Register at least one custom data renderer pathway (placeholder rich card acceptable).
- Wire session store adapter through app RPC.

### Phase 4: Rich Domain Blocks

- Add `data-listingCard` renderer in listing-hunter app/package.
- Validate inline rich listing display from chat tool/agent outputs.

## Validation and Tests

### chat-core tests

- `useChatSessions`:
  - initial load behavior
  - tmp-id remap and hydration preservation
  - select/create/reload flows
  - push update merge behavior
- `ChatConversation`:
  - streaming text flow
  - cancellation behavior
  - tool approval callback path
  - custom data renderer invocation
  - unsupported part fallback rendering

### app-level validation

- `apps/chat`: behavior parity versus current UI.
- `listing-hunter`/`nz-house-hunt`: interview flow boots with shared chat UI.

### Required commands

From repo root:

- `bun run typecheck:chat-core`
- `bun run typecheck:chat`
- `bun run typecheck:listing-hunter`
- `bun run typecheck:nz-house-hunt`

When modifying `packages/chat-core`:

- `bun run --cwd packages/chat-core test`

## Migration Strategy

- Phase 2 uses direct cutover in `apps/chat` after shared API/renderer parity is implemented.
- Remove app-local duplicated conversation/session orchestration and vendored Elements/UI trees in the same change.
- Compare behavior against runbook checks and preserve persistence/remap/push-update semantics.
- Keep API additive and small until second consumer (`listing-hunter`) is stable.

## Risks and Mitigations

- Risk: Over-coupling shared UI to one app's message schema.
  - Mitigation: generic part renderer extension points and domain data-part slots.

- Risk: Shared UI becomes too rigid for future apps.
  - Mitigation: expose headless hook + overridable renderers, not a monolith only.

- Risk: Runtime boundary regressions.
  - Mitigation: explicit web-only typecheck includes for `src/react/**`.

- Risk: Regression in session remap semantics.
  - Mitigation: preserve existing behavioral contract tests in chat-core.

## Success Criteria

- New app can integrate a production-ready conversation view in under one day.
- No copy-paste of session lifecycle logic from `apps/chat/App.tsx`.
- Apps can render custom rich in-chat blocks without forking core conversation UI.
- `listing-hunter` Phase 4 interview chat ships using `@cortex/chat-core/react`.

## Open Questions

- Should `@cortex/chat-core/react` ship with default CSS or stay fully headless with class hooks? (deferred)
- Do we include a default session list component, or keep only headless session state + conversation view? (deferred)
- How opinionated should the default tool renderer be for advanced tool UIs? (deferred)
- Should attachment UX be included in v1 or deferred? (deferred)
- `data-agentActivity` default rendering ownership for Phase 2 is locked to `@cortex/chat-core/react`.
