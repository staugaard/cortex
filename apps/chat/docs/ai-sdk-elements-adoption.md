# AI SDK Elements Adoption Standard (Docs-Gated)

## Purpose
This document is the merge-gate policy for `apps/chat` UI architecture.

Non-negotiable:
1. AI SDK stream/message/tool contracts are canonical.
2. AI SDK Elements are default for matching semantics.
3. Custom components are exception-only.
4. Every adopted Element must include docs compliance from `https://elements.ai-sdk.dev/components/<component>`.

## Adoption Workflow (Required)
For every adopted component:
1. Read the official docs page.
2. Complete the checklist section for that component.
3. Implement using documented composition patterns.
4. Add/extend manual verification steps in `automation-runbook.md`.
5. Pass `bun run --cwd apps/chat check:elements-adoption`.

## Docs Compliance Checklist Template

### `<component-name>`
- Official docs URL:
- Intended use in app:
- Required props/state model:
- Streaming behavior requirements:
- Accessibility requirements:
- Composition pattern from docs:
- Explicitly out of scope in this app:
- Verification steps:
  - Manual:
  - Type/Test:

## Elements Exception Policy
Allowed custom components (temporary or app-shell specific):
- `SessionRail`
- `DiagnosticsPanel`
- `Toolbar`
- `ErrorToasts`
- `AgentActivityItem` (temporary exception; migration target is `Task`/`Plan`/`Agent` Elements)

All other chat-message-semantic UI should use Elements.

## Full Elements Catalog Matrix

Status legend:
- `MUST-NOW`
- `MUST-WHEN-FEATURE`
- `DEFER`
- `N/A`

| Component | Status | Notes |
|---|---|---|
| Agent | MUST-WHEN-FEATURE | Use for agent config/presentation surfaces. |
| Artifact | MUST-WHEN-FEATURE | Use for rich generated artifact output. |
| Attachments | MUST-WHEN-FEATURE | Adopt when file upload in composer is enabled. |
| Audio Player | MUST-WHEN-FEATURE | Adopt with TTS/audio output. |
| Canvas | N/A | React Flow canvas primitive; not in linear chat UX. |
| Chain of Thought | DEFER | Prefer `Reasoning` for current scope. |
| Checkpoint | MUST-WHEN-FEATURE | For explicit restore points. |
| Code Block | MUST-NOW | Use for structured code/payload blocks. |
| Commit | DEFER | Tool output specific. |
| Confirmation | MUST-NOW | Tool approval UX. |
| Connection | N/A | React Flow edge helper. |
| Context | MUST-WHEN-FEATURE | For token/cost/context display. |
| Controls | N/A | React Flow controls. |
| Conversation | MUST-NOW | Canonical conversation layout. |
| Edge | N/A | React Flow edge primitive. |
| Environment Variables | DEFER | Tool output specific. |
| File Tree | DEFER | Tool output specific. |
| Image | MUST-WHEN-FEATURE | Image generation/viewing path. |
| Inline Citation | MUST-WHEN-FEATURE | Inline source links/citations. |
| JSX Preview | DEFER | Generated JSX/UI preview flow. |
| Message | MUST-NOW | Canonical message primitives. |
| Mic Selector | MUST-WHEN-FEATURE | Voice input device selection. |
| Model Selector | MUST-WHEN-FEATURE | When model choice is exposed. |
| Node | N/A | React Flow node primitive. |
| Open In Chat | DEFER | Optional utility. |
| Package Info | DEFER | Tool output specific. |
| Panel | N/A | React Flow panel primitive. |
| Persona | DEFER | Optional avatar/voice layer. |
| Plan | MUST-WHEN-FEATURE | Structured planning output. |
| Prompt Input | MUST-NOW | Canonical prompt composer. |
| Queue | MUST-WHEN-FEATURE | Background task list UI. |
| Reasoning | MUST-NOW | Canonical reasoning renderer. |
| Sandbox | MUST-WHEN-FEATURE | Code execution output. |
| Schema Display | DEFER | Tool output specific. |
| Shimmer | MUST-NOW | Standard loading affordance. |
| Snippet | MUST-NOW | Inline code metadata display. |
| Sources | MUST-WHEN-FEATURE | Source section rendering. |
| Speech Input | MUST-WHEN-FEATURE | Voice prompt capture. |
| Stack Trace | DEFER | Error detail output. |
| Suggestion | MUST-WHEN-FEATURE | Suggested prompt chips. |
| Task | MUST-WHEN-FEATURE | Agent/task progress list. |
| Terminal | MUST-WHEN-FEATURE | Streamed terminal output. |
| Test Results | DEFER | Test tool output display. |
| Tool | MUST-NOW | Canonical tool invocation renderer. |
| Toolbar | N/A | React Flow toolbar primitive. |
| Transcription | MUST-WHEN-FEATURE | Transcript rendering. |
| Voice Selector | MUST-WHEN-FEATURE | TTS voice selection. |
| Web Preview | DEFER | Web artifact preview output. |

## MUST-NOW Checklists (Completed)

### Conversation
- Official docs URL: https://elements.ai-sdk.dev/components/conversation
- Intended use in app: Primary scroll container and bottom-stick behavior for chat timeline.
- Required props/state model: Conversation wrapper with `ConversationContent` and `ConversationScrollButton`.
- Streaming behavior requirements: New chunks append without scroll-jank.
- Accessibility requirements: Scroll button must remain keyboard-focusable.
- Composition pattern from docs: `Conversation > ConversationContent > Message[]` + `ConversationScrollButton`.
- Explicitly out of scope in this app: virtualized conversation list.
- Verification steps:
  - Manual: long response, scroll away, verify scroll button and restore.
  - Type/Test: `bun run typecheck:chat`.

### Message
- Official docs URL: https://elements.ai-sdk.dev/components/message
- Intended use in app: Render user/assistant messages and markdown responses.
- Required props/state model: role-aware message wrapper + message content.
- Streaming behavior requirements: assistant content animates during streaming.
- Accessibility requirements: semantic text rendering and readable contrast.
- Composition pattern from docs: `Message` + `MessageContent` + `MessageResponse`.
- Explicitly out of scope in this app: branch switching UI.
- Verification steps:
  - Manual: stream markdown response and verify incremental rendering.
  - Type/Test: `bun run typecheck:chat`.

### Prompt Input
- Official docs URL: https://elements.ai-sdk.dev/components/prompt-input
- Intended use in app: main composer + submit/stop controls.
- Required props/state model: submit callback, streaming status wiring.
- Streaming behavior requirements: stop button available while streaming.
- Accessibility requirements: textarea and submit controls keyboard accessible.
- Composition pattern from docs: `PromptInput` + `PromptInputTextarea` + footer + submit.
- Explicitly out of scope in this app: file attachments.
- Verification steps:
  - Manual: send/cancel flow works.
  - Type/Test: `bun run typecheck:chat`.

### Reasoning
- Official docs URL: https://elements.ai-sdk.dev/components/reasoning
- Intended use in app: render reasoning parts from AI SDK stream.
- Required props/state model: reasoning content + streaming open/close behavior.
- Streaming behavior requirements: auto-open while streaming; collapsible after completion.
- Accessibility requirements: semantic summary/details pattern.
- Composition pattern from docs: collapsible reasoning container with explicit content region.
- Explicitly out of scope in this app: chain-of-thought step timeline.
- Verification steps:
  - Manual: prompt that emits reasoning and confirm visible reasoning section.
  - Type/Test: `bun run typecheck:chat`.

### Tool
- Official docs URL: https://elements.ai-sdk.dev/components/tool
- Intended use in app: root tool render for all non-hidden tool calls.
- Required props/state model: tool name, state, input/output/error metadata.
- Streaming behavior requirements: input streaming/loading state surfaced.
- Accessibility requirements: collapsible header and readable labeled sections.
- Composition pattern from docs: collapsible tool container with header + structured sections.
- Explicitly out of scope in this app: nested interactive tool trees.
- Verification steps:
  - Manual: verify `get_local_time` success and `always_fail_for_test` error cards.
  - Type/Test: `bun run typecheck:chat`.

### Confirmation
- Official docs URL: https://elements.ai-sdk.dev/components/confirmation
- Intended use in app: approval-requested tool state UX.
- Required props/state model: request body + approve/deny actions.
- Streaming behavior requirements: must persist until decision submitted.
- Accessibility requirements: clear action labels and keyboard-operable buttons.
- Composition pattern from docs: confirmation request region with explicit actions.
- Explicitly out of scope in this app: multi-party approvals.
- Verification steps:
  - Manual: deny and approve flows both tested.
  - Type/Test: `bun run typecheck:chat`.

### Snippet
- Official docs URL: https://elements.ai-sdk.dev/components/snippet
- Intended use in app: inline metadata such as tool call IDs.
- Required props/state model: lightweight inline code style.
- Streaming behavior requirements: safe for streaming updates.
- Accessibility requirements: adequate contrast, monospace readability.
- Composition pattern from docs: inline compact code token.
- Explicitly out of scope in this app: multi-line snippets.
- Verification steps:
  - Manual: tool call IDs render as snippet tokens.
  - Type/Test: `bun run typecheck:chat`.

### Code Block
- Official docs URL: https://elements.ai-sdk.dev/components/code-block
- Intended use in app: render tool input/output/error payloads.
- Required props/state model: preformatted multi-line content.
- Streaming behavior requirements: tolerate partial updates without layout breakage.
- Accessibility requirements: pre/code semantics.
- Composition pattern from docs: dedicated block-level code wrapper.
- Explicitly out of scope in this app: custom syntax lexers.
- Verification steps:
  - Manual: verify JSON payload readability in tool cards.
  - Type/Test: `bun run typecheck:chat`.

### Shimmer
- Official docs URL: https://elements.ai-sdk.dev/components/shimmer
- Intended use in app: lightweight loading affordance for streaming tool input.
- Required props/state model: placeholder content container.
- Streaming behavior requirements: visible during input streaming state only.
- Accessibility requirements: avoid flashing; simple animated pulse.
- Composition pattern from docs: shimmer loading element.
- Explicitly out of scope in this app: full skeleton screen framework.
- Verification steps:
  - Manual: trigger streaming tool input and verify shimmer appears.
  - Type/Test: `bun run typecheck:chat`.

## Vendor + Sync Policy
- Components are vendored in `src/mainview/components/ai-elements`.
- Recommended update command per component: `bunx ai-elements@latest add <component>`.
- Drift check command: `bun run --cwd apps/chat check:elements-adoption`.
- CI policy: this check must run in chat UI CI and fail on drift/non-compliant renderer wiring.
