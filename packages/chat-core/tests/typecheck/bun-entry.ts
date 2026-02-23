import type { Agent, UIMessage, UIMessageChunk } from "ai";
import {
	createAgentUIChunkStream,
	createBunChatRunController,
	handleCancelAgentRun,
	handleStartAgentRun,
} from "../../src/transport-bun";

const controller = createBunChatRunController<UIMessage, UIMessageChunk>({
	createUIMessageStream: async () => {
		return new ReadableStream<UIMessageChunk>({
			start: (streamController) => {
				streamController.enqueue({ type: "start", messageId: "m1" });
				streamController.close();
			},
		});
	},
	sendChunk: () => {},
	sendDone: () => {},
	sendError: () => {},
});

handleStartAgentRun(controller, {
	chatId: "chat-1",
	runId: "run-1",
	messages: [],
});

handleCancelAgentRun(controller, {
	chatId: "chat-1",
	runId: "run-1",
});

void createAgentUIChunkStream({
	agent: {} as Agent,
	messages: [],
	abortSignal: new AbortController().signal,
});
