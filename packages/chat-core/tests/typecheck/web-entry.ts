import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import { createElectrobunChatTransport } from "../../src/transport-web";
import type { ChatElectrobunSchema } from "../../src/rpc";
import {
	asAgentActivityData,
	AgentActivityPart,
	ChatConversation,
	createTemporarySessionId,
	renderMessagePart,
	type AgentActivityData,
	type AgentActivityEvent,
	type ChatSessionStore,
	type ChatSessionSummary,
	type ChatToolPart,
	useChatSessions,
} from "../../src/react";

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

const summaryTypecheck: ChatSessionSummary = {
	sessionId: "s1",
	title: "Session",
	createdAt: 0,
	updatedAt: 0,
};
void summaryTypecheck;

const storeTypecheck: ChatSessionStore<UIMessage> = {
	listSessions: async () => ({ sessions: [] }),
	getSession: async () => ({ session: null }),
	saveSession: async () => ({ sessionId: "s1", savedAt: Date.now() }),
	subscribeSessionUpdated: () => () => {},
};
void storeTypecheck;

void createTemporarySessionId();
const useChatSessionsTypecheck = useChatSessions<UIMessage>;
void useChatSessionsTypecheck;

const chatConversationTypecheck = ChatConversation<UIMessage>;
void chatConversationTypecheck;

const renderMessagePartTypecheck = renderMessagePart<UIMessage>;
void renderMessagePartTypecheck;

const toolPartTypecheck: ChatToolPart = {
	type: "dynamic-tool",
	toolName: "demo",
	toolCallId: "call-1",
	state: "output-available",
	input: {},
	output: {},
};
void toolPartTypecheck;

const eventTypecheck: AgentActivityEvent = {
	id: "evt-1",
	timestamp: Date.now(),
	source: "manager",
	type: "note",
	message: "ok",
};
void eventTypecheck;

const agentActivityTypecheck: AgentActivityData = {
	activityId: "act-1",
	workflow: "math-expert",
	status: "running",
	startedAt: Date.now(),
	updatedAt: Date.now(),
	counters: {
		steps: 0,
		toolCalls: 0,
		completedRuns: 0,
		cancelledRuns: 0,
		failedRuns: 0,
	},
	events: [eventTypecheck],
};
void agentActivityTypecheck;

const parsedActivityTypecheck = asAgentActivityData(agentActivityTypecheck);
void parsedActivityTypecheck;

const agentActivityPartTypecheck = AgentActivityPart;
void agentActivityPartTypecheck;
