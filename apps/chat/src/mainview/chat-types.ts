import type { UIMessage, UIMessageChunk } from "ai";
import type { ChatElectrobunSchema } from "@cortex/chat-core/rpc";

export type ChatUIMessage = UIMessage;
export type ChatUIChunk = UIMessageChunk;
export type AppChatSchema = ChatElectrobunSchema<ChatUIMessage, ChatUIChunk>;

export const TEMP_SESSION_PREFIX = "tmp:";

export function createTemporarySessionId(): string {
	return `${TEMP_SESSION_PREFIX}${crypto.randomUUID()}`;
}
