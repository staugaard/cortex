import type { UIMessage, UIMessageChunk } from "ai";
import { BrowserView } from "electrobun/bun";
import {
	createAgentUIChunkStream,
	createBunChatRunController,
	handleCancelAgentRun,
	handleStartAgentRun,
} from "@cortex/chat-core/transport-bun";
import type { AppChatSchema } from "../mainview/chat-types";
import { chatAgent } from "./chat-agent";
import { chatMemoryStore } from "./chat-memory-store";

const runController = createBunChatRunController<UIMessage, UIMessageChunk>({
	createUIMessageStream: ({ messages, abortSignal }) =>
		createAgentUIChunkStream({
			agent: chatAgent,
			messages,
			abortSignal,
		}),
	sendChunk: (payload) => chatRpc.send.agentChunk(payload),
	sendDone: (payload) => chatRpc.send.agentDone(payload),
	sendError: (payload) => chatRpc.send.agentError(payload),
});

export const chatRpc = BrowserView.defineRPC<AppChatSchema>({
	handlers: {
		requests: {
			getConversationList: (params) =>
				chatMemoryStore.getConversationList(params),
			getConversation: (params) => chatMemoryStore.getConversation(params),
			saveMessages: (params) => chatMemoryStore.saveMessages(params),
		},
		messages: {
			startAgentRun: (payload) => handleStartAgentRun(runController, payload),
			cancelAgentRun: (payload) => handleCancelAgentRun(runController, payload),
		},
	},
});
