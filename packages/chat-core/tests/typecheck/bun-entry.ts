import type { Agent, UIMessage, UIMessageChunk } from "ai";
import {
	createAgentUIChunkStream,
	createBunChatRunController,
	handleCancelAgentRun,
	handleStartAgentRun,
} from "../../src/transport-bun";
import { createSqliteChatRepository } from "../../src/persistence";
import { ToolLoopAgent } from "ai";
import {
	createAgentActivityRecorder,
	createAgentLoopInstrumentation,
	composeAgentLoopHooks,
	runSubagentUIMessageStream,
} from "../../src/agents";

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

const instrumentation = createAgentLoopInstrumentation();
const recorder = createAgentActivityRecorder({
	activityId: "activity",
});
const composedHooks = composeAgentLoopHooks(
	instrumentation.hooks,
	recorder.createHooks("agent"),
);
void composedHooks;

const dummyAgent = new ToolLoopAgent({
	model: {} as never,
	instructions: "Typecheck only",
});

void runSubagentUIMessageStream({
	agent: dummyAgent,
	uiMessages: [],
	hooks: recorder.createHooks("subagent"),
});

const persistenceRepo = createSqliteChatRepository<UIMessage>({
	dbPath: "/tmp/chat-core-typecheck.sqlite",
});

void persistenceRepo;
