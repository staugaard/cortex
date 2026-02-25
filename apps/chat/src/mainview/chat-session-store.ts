import type { ChatSessionStore } from "@cortex/chat-core/react";
import { chatRpc } from "./chat-rpc";
import type { ChatUIMessage } from "./chat-types";

export const chatSessionStore: ChatSessionStore<ChatUIMessage> = {
	listSessions: async (input) => {
		const result = await chatRpc.request.getConversationList({
			limit: input?.limit,
		});
		return {
			sessions: result.conversations.map((conversation) => ({
				sessionId: conversation.sessionId,
				title: conversation.title,
				createdAt: conversation.createdAt,
				updatedAt: conversation.updatedAt,
			})),
		};
	},
	getSession: async ({ sessionId }) => {
		const result = await chatRpc.request.getConversation({ sessionId });
		const conversation = result.conversation;
		if (!conversation) {
			return { session: null };
		}
		return {
			session: {
				sessionId: conversation.sessionId,
				title: conversation.title,
				createdAt: conversation.createdAt,
				updatedAt: conversation.updatedAt,
				messages: conversation.messages,
			},
		};
	},
	saveSession: async ({ sessionId, messages }) => {
		const result = await chatRpc.request.saveMessages({
			sessionId,
			messages,
		});
		return {
			sessionId: result.sessionId,
			savedAt: result.savedAt,
		};
	},
	subscribeSessionUpdated: (handler) => {
		const onConversationUpdated = (conversation: {
			sessionId: string;
			title?: string;
			createdAt: number;
			updatedAt: number;
		}) => {
			handler({
				sessionId: conversation.sessionId,
				title: conversation.title,
				createdAt: conversation.createdAt,
				updatedAt: conversation.updatedAt,
			});
		};
		chatRpc.addMessageListener("conversationUpdated", onConversationUpdated);
		return () => {
			chatRpc.removeMessageListener(
				"conversationUpdated",
				onConversationUpdated,
			);
		};
	},
};
