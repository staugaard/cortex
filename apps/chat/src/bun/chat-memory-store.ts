import type {
	ConversationRecord,
	ConversationSummary,
	GetConversationListRequest,
	GetConversationListResponse,
	GetConversationRequest,
	GetConversationResponse,
	SaveMessagesRequest,
	SaveMessagesResponse,
} from "@cortex/chat-core/rpc";
import type { ChatUIMessage } from "../mainview/chat-types";

class ChatMemoryStore {
	private conversations = new Map<string, ConversationRecord<ChatUIMessage>>();

	getConversationList(
		params: GetConversationListRequest,
	): GetConversationListResponse {
		const limit = params.limit ?? 50;
		const conversations = Array.from(this.conversations.values())
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.slice(0, limit)
			.map<ConversationSummary>((conversation) => ({
				sessionId: conversation.sessionId,
				title: conversation.title,
				createdAt: conversation.createdAt,
				updatedAt: conversation.updatedAt,
			}));

		return { conversations };
	}

	getConversation(
		params: GetConversationRequest,
	): GetConversationResponse<ChatUIMessage> {
		return {
			conversation: this.conversations.get(params.sessionId) ?? null,
		};
	}

	saveMessages(
		params: SaveMessagesRequest<ChatUIMessage>,
	): SaveMessagesResponse {
		const existing = this.conversations.get(params.sessionId);
		const now = Date.now();

		this.conversations.set(params.sessionId, {
			sessionId: params.sessionId,
			title: params.title ?? existing?.title,
			metadata: params.metadata ?? existing?.metadata,
			messages: params.messages,
			createdAt: existing?.createdAt ?? now,
			updatedAt: now,
		});

		return { savedAt: now };
	}
}

export const chatMemoryStore = new ChatMemoryStore();
