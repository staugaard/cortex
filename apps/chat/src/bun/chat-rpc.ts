import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createUIMessageStream } from "ai";
import { BrowserView, Utils } from "electrobun/bun";
import {
	createBunChatRunController,
	handleCancelAgentRun,
	handleStartAgentRun,
} from "@cortex/chat-core/transport-bun";
import { createSqliteChatRepository } from "@cortex/chat-core/persistence";
import type { AppChatSchema, ChatUIChunk, ChatUIMessage } from "../mainview/chat-types";
import { createChatRunUIChunkStream } from "./chat-agent";
import { generateConversationTitle } from "./chat-title-generator";

const chatDatabasePath = join(Utils.paths.userData, "chat.sqlite");
mkdirSync(dirname(chatDatabasePath), { recursive: true });

const chatRepository = createSqliteChatRepository<ChatUIMessage>({
	dbPath: chatDatabasePath,
	generateTitle: generateConversationTitle,
	generateTitleTimeoutMs: 15_000,
	onConversationUpdated: (conversation) => {
		chatRpc.send.conversationUpdated(conversation);
	},
});

const runController = createBunChatRunController<ChatUIMessage, ChatUIChunk>({
	createUIMessageStream: async ({ chatId, runId, messages, abortSignal }) =>
		createUIMessageStream<ChatUIMessage>({
			execute: async ({ writer }) => {
				const stream = await createChatRunUIChunkStream({
					chatId,
					runId,
					messages,
					abortSignal,
					onActivityUpdate: (activity) => {
						writer.write({
							type: "data-agentActivity",
							id: activity.activityId,
							data: activity,
						});
					},
				});
				writer.merge(stream);
			},
			originalMessages: messages,
		}) as ReadableStream<ChatUIChunk>,
	sendChunk: (payload) => chatRpc.send.agentChunk(payload),
	sendDone: (payload) => chatRpc.send.agentDone(payload),
	sendError: (payload) => chatRpc.send.agentError(payload),
});

export const chatRpc = BrowserView.defineRPC<AppChatSchema>({
	handlers: {
		requests: {
			getConversationList: (params) =>
				chatRepository.getConversationList(params),
			getConversation: (params) => chatRepository.getConversation(params),
			saveMessages: (params) => chatRepository.saveMessages(params),
		},
		messages: {
			startAgentRun: (payload) => handleStartAgentRun(runController, payload),
			cancelAgentRun: (payload) => handleCancelAgentRun(runController, payload),
		},
	},
});
