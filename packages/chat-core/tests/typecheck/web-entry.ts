import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import { createElectrobunChatTransport } from "../../src/transport-web";
import type { ChatElectrobunSchema } from "../../src/rpc";

const schemaTypecheck: ChatElectrobunSchema<UIMessage, UIMessageChunk> = {
	bun: {
		requests: {
			getConversationList: {
				params: { limit: 20 },
				response: { conversations: [] },
			},
			getConversation: {
				params: { sessionId: "s1" },
				response: { conversation: null },
			},
			saveMessages: {
				params: { sessionId: "s1", messages: [] },
				response: { sessionId: "s1", savedAt: 0 },
			},
		},
		messages: {
			startAgentRun: { chatId: "c1", runId: "r1", messages: [] },
			cancelAgentRun: { chatId: "c1", runId: "r1" },
		},
	},
	webview: {
		requests: {},
		messages: {
			agentChunk: {
				chatId: "c1",
				runId: "r1",
				chunk: { type: "start", messageId: "m1" } as UIMessageChunk,
			},
			agentDone: { chatId: "c1", runId: "r1", reason: "completed" },
			agentError: { chatId: "c1", runId: "r1", error: "boom" },
			conversationUpdated: {
				sessionId: "s1",
				title: "Title",
				createdAt: 1,
				updatedAt: 2,
			},
		},
	},
};

void schemaTypecheck;

const transport: ChatTransport<UIMessage> = createElectrobunChatTransport({
	sendStart: () => {},
	sendCancel: () => {},
	subscribeChunk: () => () => {},
	subscribeDone: () => () => {},
	subscribeError: () => () => {},
});

void transport;
