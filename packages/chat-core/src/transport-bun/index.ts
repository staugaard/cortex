import { createAgentUIStream, type Agent, type UIMessageChunk } from "ai";
import type {
	AgentChunkMessage,
	AgentDoneMessage,
	AgentErrorMessage,
	CancelAgentRunMessage,
	ChatId,
	RunId,
	StartAgentRunMessage,
} from "../rpc";
import type {
	BunRuntimeFlag,
	RequireBunRuntime,
} from "../internal/runtime-tags";

const assertBunRuntime: RequireBunRuntime<BunRuntimeFlag> = true;
void assertBunRuntime;

export interface ActiveRun {
	chatId: ChatId;
	runId: RunId;
	abortController: AbortController;
}

export interface BunChatRunController<UI_MESSAGE> {
	readonly activeRuns: Map<ChatId, ActiveRun>;
	startRun: (message: StartAgentRunMessage<UI_MESSAGE>) => void;
	cancelRun: (message: CancelAgentRunMessage) => void;
}

export interface CreateBunChatRunControllerOptions<UI_MESSAGE, UI_CHUNK> {
	createUIMessageStream: (input: {
		chatId: ChatId;
		runId: RunId;
		messages: UI_MESSAGE[];
		abortSignal: AbortSignal;
	}) => Promise<ReadableStream<UI_CHUNK> | AsyncIterable<UI_CHUNK>>;
	sendChunk: (payload: AgentChunkMessage<UI_CHUNK>) => void;
	sendDone: (payload: AgentDoneMessage) => void;
	sendError: (payload: AgentErrorMessage) => void;
}

async function* readStream<UI_CHUNK>(
	stream: ReadableStream<UI_CHUNK> | AsyncIterable<UI_CHUNK>,
): AsyncGenerator<UI_CHUNK> {
	if ("getReader" in stream) {
		const reader = stream.getReader();
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}
				yield value;
			}
		} finally {
			reader.releaseLock();
		}
		return;
	}

	yield* stream;
}

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

export function createBunChatRunController<UI_MESSAGE, UI_CHUNK>(
	options: CreateBunChatRunControllerOptions<UI_MESSAGE, UI_CHUNK>,
): BunChatRunController<UI_MESSAGE> {
	const activeRuns = new Map<ChatId, ActiveRun>();

	const startRun = (message: StartAgentRunMessage<UI_MESSAGE>) => {
		const previousRun = activeRuns.get(message.chatId);
		if (previousRun) {
			previousRun.abortController.abort();
			activeRuns.delete(previousRun.chatId);
			options.sendDone({
				chatId: previousRun.chatId,
				runId: previousRun.runId,
				reason: "cancelled",
			});
		}

		const activeRun: ActiveRun = {
			chatId: message.chatId,
			runId: message.runId,
			abortController: new AbortController(),
		};

		activeRuns.set(message.chatId, activeRun);

		void (async () => {
			try {
				const stream = await options.createUIMessageStream({
					chatId: message.chatId,
					runId: message.runId,
					messages: message.messages,
					abortSignal: activeRun.abortController.signal,
				});

				for await (const chunk of readStream(stream)) {
					const currentRun = activeRuns.get(message.chatId);
					if (!currentRun || currentRun.runId !== message.runId) {
						return;
					}
					options.sendChunk({
						chatId: message.chatId,
						runId: message.runId,
						chunk,
					});
				}

				const currentRun = activeRuns.get(message.chatId);
				if (!currentRun || currentRun.runId !== message.runId) {
					return;
				}

				activeRuns.delete(message.chatId);
				options.sendDone({
					chatId: message.chatId,
					runId: message.runId,
					reason: currentRun.abortController.signal.aborted
						? "cancelled"
						: "completed",
				});
			} catch (error) {
				const currentRun = activeRuns.get(message.chatId);
				if (!currentRun || currentRun.runId !== message.runId) {
					return;
				}

				activeRuns.delete(message.chatId);
				if (currentRun.abortController.signal.aborted) {
					options.sendDone({
						chatId: message.chatId,
						runId: message.runId,
						reason: "cancelled",
					});
					return;
				}

				options.sendError({
					chatId: message.chatId,
					runId: message.runId,
					error: toErrorMessage(error),
				});
			}
		})();
	};

	const cancelRun = (message: CancelAgentRunMessage) => {
		const activeRun = activeRuns.get(message.chatId);
		if (!activeRun || activeRun.runId !== message.runId) {
			return;
		}

		activeRun.abortController.abort();
		activeRuns.delete(message.chatId);
		options.sendDone({
			chatId: message.chatId,
			runId: message.runId,
			reason: "cancelled",
		});
	};

	return {
		activeRuns,
		startRun,
		cancelRun,
	};
}

export function handleStartAgentRun<UI_MESSAGE>(
	controller: BunChatRunController<UI_MESSAGE>,
	message: StartAgentRunMessage<UI_MESSAGE>,
): void {
	controller.startRun(message);
}

export function handleCancelAgentRun<UI_MESSAGE>(
	controller: BunChatRunController<UI_MESSAGE>,
	message: CancelAgentRunMessage,
): void {
	controller.cancelRun(message);
}

export function createAgentUIChunkStream<UI_MESSAGE>(input: {
	agent: Agent;
	messages: UI_MESSAGE[];
	abortSignal: AbortSignal;
}): Promise<ReadableStream<UIMessageChunk> | AsyncIterable<UIMessageChunk>> {
	return createAgentUIStream({
		agent: input.agent,
		uiMessages: input.messages,
		abortSignal: input.abortSignal,
	});
}
