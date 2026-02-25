import type {
	RequireWebRuntime,
	WebRuntimeFlag,
} from "../internal/runtime-tags";

const assertWebRuntime: RequireWebRuntime<WebRuntimeFlag> = true;
void assertWebRuntime;

export {
	createTemporarySessionId,
	TEMP_SESSION_PREFIX,
	useChatSessions,
} from "./use-chat-sessions";
export { ChatConversation } from "./chat-conversation";
export { renderMessagePart } from "./part-renderers";
export type {
	ChatComposerRenderInput,
	ChatConversationProps,
	ChatDataPartRenderer,
	ChatSessionRecord,
	ChatSessionStore,
	ChatSessionSummary,
	ChatToolPart,
	ChatToolPartRenderer,
	ChatUnsupportedPartRenderer,
	UseChatSessionsResult,
} from "./types";
