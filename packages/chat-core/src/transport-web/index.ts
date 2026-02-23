import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import type {
	AgentChunkMessage,
	AgentDoneMessage,
	AgentErrorMessage,
	CancelAgentRunMessage,
	RunId,
	StartAgentRunMessage,
} from "../rpc";
import type {
	RequireWebRuntime,
	WebRuntimeFlag,
} from "../internal/runtime-tags";

const assertWebRuntime: RequireWebRuntime<WebRuntimeFlag> = true;
void assertWebRuntime;

export interface ElectrobunChatTransportDeps<UI_MESSAGE extends UIMessage> {
	sendStart: (payload: StartAgentRunMessage<UI_MESSAGE>) => void;
	sendCancel: (payload: CancelAgentRunMessage) => void;
	subscribeChunk: (
		handler: (payload: AgentChunkMessage<UIMessageChunk>) => void,
	) => () => void;
	subscribeDone: (handler: (payload: AgentDoneMessage) => void) => () => void;
	subscribeError: (handler: (payload: AgentErrorMessage) => void) => () => void;
	generateRunId?: () => RunId;
}

function createRunId(): RunId {
	return crypto.randomUUID();
}

function ensureReadableError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}
	return new Error(String(error));
}

export class ElectrobunChatTransport<
	UI_MESSAGE extends UIMessage = UIMessage,
> implements ChatTransport<UI_MESSAGE>
{
	constructor(private readonly deps: ElectrobunChatTransportDeps<UI_MESSAGE>) {}

	async sendMessages({
		chatId,
		messages,
		abortSignal,
	}: Parameters<ChatTransport<UI_MESSAGE>["sendMessages"]>[0]): Promise<
		ReadableStream<UIMessageChunk>
	> {
		const runId = this.deps.generateRunId?.() ?? createRunId();
		let settled = false;

		return new ReadableStream<UIMessageChunk>({
			start: (controller) => {
				let unsubscribeChunk: (() => void) | undefined;
				let unsubscribeDone: (() => void) | undefined;
				let unsubscribeError: (() => void) | undefined;
				let abortListener: (() => void) | undefined;

				const cleanup = () => {
					unsubscribeChunk?.();
					unsubscribeDone?.();
					unsubscribeError?.();
					if (abortListener) {
						abortSignal?.removeEventListener("abort", abortListener);
					}
				};

				const settleClose = () => {
					if (settled) {
						return;
					}
					settled = true;
					cleanup();
					controller.close();
				};

				const settleError = (error: unknown) => {
					if (settled) {
						return;
					}
					settled = true;
					cleanup();
					controller.error(ensureReadableError(error));
				};

				unsubscribeChunk = this.deps.subscribeChunk((payload) => {
					if (
						payload.chatId !== chatId ||
						payload.runId !== runId ||
						settled
					) {
						return;
					}
					controller.enqueue(payload.chunk);
				});

				unsubscribeDone = this.deps.subscribeDone((payload) => {
					if (
						payload.chatId !== chatId ||
						payload.runId !== runId ||
						settled
					) {
						return;
					}
					settleClose();
				});

				unsubscribeError = this.deps.subscribeError((payload) => {
					if (
						payload.chatId !== chatId ||
						payload.runId !== runId ||
						settled
					) {
						return;
					}
					settleError(payload.error);
				});

				abortListener = () => {
					this.deps.sendCancel({ chatId, runId });
					settleClose();
				};

				if (abortSignal?.aborted) {
					abortListener();
					return;
				}

				if (abortSignal) {
					abortSignal.addEventListener("abort", abortListener, { once: true });
				}

				this.deps.sendStart({
					chatId,
					runId,
					messages,
				});
			},
			cancel: () => {
				if (!settled) {
					this.deps.sendCancel({ chatId, runId });
				}
			},
		});
	}

	async reconnectToStream(
		_options: Parameters<ChatTransport<UI_MESSAGE>["reconnectToStream"]>[0],
	): Promise<ReadableStream<UIMessageChunk> | null> {
		return null;
	}
}

export function createElectrobunChatTransport<
	UI_MESSAGE extends UIMessage = UIMessage,
>(
	deps: ElectrobunChatTransportDeps<UI_MESSAGE>,
): ChatTransport<UI_MESSAGE> {
	return new ElectrobunChatTransport(deps);
}
