export type ChatId = string;
export type RunId = string;

export interface StartAgentRunMessage<UI_MESSAGE> {
	chatId: ChatId;
	runId: RunId;
	messages: UI_MESSAGE[];
	agentId?: string;
}

export interface CancelAgentRunMessage {
	chatId: ChatId;
	runId: RunId;
}

export interface AgentChunkMessage<UI_CHUNK> {
	chatId: ChatId;
	runId: RunId;
	chunk: UI_CHUNK;
}

export interface AgentDoneMessage {
	chatId: ChatId;
	runId: RunId;
	reason: "completed" | "cancelled";
}

export interface AgentErrorMessage {
	chatId: ChatId;
	runId: RunId;
	error: string;
}

export interface ConversationSummary {
	sessionId: string;
	title?: string;
	createdAt: number;
	updatedAt: number;
}

export interface ConversationRecord<UI_MESSAGE> {
	sessionId: string;
	title?: string;
	metadata?: Record<string, unknown>;
	messages: UI_MESSAGE[];
	createdAt: number;
	updatedAt: number;
}

export interface GetConversationListRequest {
	limit?: number;
}

export interface GetConversationListResponse {
	conversations: ConversationSummary[];
}

export interface GetConversationRequest {
	sessionId: string;
}

export interface GetConversationResponse<UI_MESSAGE> {
	conversation: ConversationRecord<UI_MESSAGE> | null;
}

export interface SaveMessagesRequest<UI_MESSAGE> {
	sessionId: string;
	messages: UI_MESSAGE[];
	title?: string;
	metadata?: Record<string, unknown>;
}

export interface SaveMessagesResponse {
	savedAt: number;
}

export type ChatElectrobunSchema<UI_MESSAGE, UI_CHUNK> = {
	bun: {
		requests: {
			getConversationList: {
				params: GetConversationListRequest;
				response: GetConversationListResponse;
			};
			getConversation: {
				params: GetConversationRequest;
				response: GetConversationResponse<UI_MESSAGE>;
			};
			saveMessages: {
				params: SaveMessagesRequest<UI_MESSAGE>;
				response: SaveMessagesResponse;
			};
		};
		messages: {
			startAgentRun: StartAgentRunMessage<UI_MESSAGE>;
			cancelAgentRun: CancelAgentRunMessage;
		};
	};
	webview: {
		requests: {};
		messages: {
			agentChunk: AgentChunkMessage<UI_CHUNK>;
			agentDone: AgentDoneMessage;
			agentError: AgentErrorMessage;
		};
	};
};
