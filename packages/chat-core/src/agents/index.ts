import {
	convertToModelMessages,
	readUIMessageStream,
	validateUIMessages,
	type Agent,
	type TimeoutConfiguration,
	type ToolLoopAgentOnFinishCallback,
	type ToolLoopAgentOnStartCallback,
	type ToolLoopAgentOnStepFinishCallback,
	type ToolLoopAgentOnStepStartCallback,
	type ToolLoopAgentOnToolCallFinishCallback,
	type ToolLoopAgentOnToolCallStartCallback,
	type ToolSet,
	type UIMessage,
	type UIMessageChunk,
} from "ai";
import type {
	BunRuntimeFlag,
	RequireBunRuntime,
} from "../internal/runtime-tags";

const assertBunRuntime: RequireBunRuntime<BunRuntimeFlag> = true;
void assertBunRuntime;

const MODEL_SAFE_PART_TYPES = new Set([
	"text",
	"file",
	"source-url",
	"source-document",
]);
const MODEL_CONTINUATION_TOOL_STATES = new Set([
	"approval-requested",
	"approval-responded",
]);

const STEP_LIFECYCLE_CHUNK_TYPES = new Set([
	"start-step",
	"finish-step",
	"step-start",
	"step-finish",
]);

function shouldKeepPartForModelInput(part: UIMessage["parts"][number]): boolean {
	if (MODEL_SAFE_PART_TYPES.has(part.type)) {
		return true;
	}

	if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
		const state = asString((part as { state?: unknown }).state);
		// Keep only continuation-relevant tool states to avoid replaying terminal
		// tool_use/tool_result structures that can violate provider sequencing.
		return state ? MODEL_CONTINUATION_TOOL_STATES.has(state) : false;
	}

	return false;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

export function sanitizeUIMessagesForModelInput<UI_MESSAGE extends UIMessage>(
	messages: UI_MESSAGE[],
): UI_MESSAGE[] {
	const sanitized: UI_MESSAGE[] = [];

	for (const message of messages) {
		const nextParts = message.parts
			.filter((part) => shouldKeepPartForModelInput(part))
			.map((part) => ({ ...part }));

		if (nextParts.length === 0) {
			continue;
		}

		sanitized.push({
			...message,
			parts: nextParts,
		});
	}

	return sanitized;
}

export interface CreateAgentLoopUIChunkStreamOptions<
	UI_MESSAGE extends UIMessage,
	CALL_OPTIONS,
	TOOLS extends ToolSet,
> {
	agent: Agent<CALL_OPTIONS, TOOLS, any>;
	uiMessages: UI_MESSAGE[];
	options?: CALL_OPTIONS;
	abortSignal?: AbortSignal;
	timeout?: TimeoutConfiguration;
	hooks?: AgentLoopHooks<TOOLS>;
	sanitizeMessagesForModel?: boolean;
}

export interface CreateAgentLoopUIChunkStreamResult<
	UI_MESSAGE extends UIMessage,
	UI_CHUNK extends UIMessageChunk,
> {
	stream: ReadableStream<UI_CHUNK>;
	validatedMessages: UI_MESSAGE[];
}

export async function createAgentLoopUIChunkStream<
	UI_MESSAGE extends UIMessage,
	CALL_OPTIONS = never,
	TOOLS extends ToolSet = ToolSet,
	UI_CHUNK extends UIMessageChunk = UIMessageChunk,
>(
	input: CreateAgentLoopUIChunkStreamOptions<UI_MESSAGE, CALL_OPTIONS, TOOLS>,
): Promise<CreateAgentLoopUIChunkStreamResult<UI_MESSAGE, UI_CHUNK>> {
	const messagesForModel =
		input.sanitizeMessagesForModel === false
			? input.uiMessages
			: sanitizeUIMessagesForModelInput(input.uiMessages);

	const validatedMessages = (await validateUIMessages({
		messages: messagesForModel,
		tools: input.agent.tools,
	})) as UI_MESSAGE[];

	const modelMessages = await convertToModelMessages(validatedMessages, {
		tools: input.agent.tools,
	});

	const streamParams: Parameters<typeof input.agent.stream>[0] = {
		prompt: modelMessages,
		abortSignal: input.abortSignal,
		timeout: input.timeout,
		experimental_onStart: input.hooks?.experimental_onStart,
		experimental_onStepStart: input.hooks?.experimental_onStepStart,
		experimental_onToolCallStart: input.hooks?.experimental_onToolCallStart,
		experimental_onToolCallFinish: input.hooks?.experimental_onToolCallFinish,
		onStepFinish: input.hooks?.onStepFinish,
		onFinish: input.hooks?.onFinish,
	};

	if (input.options !== undefined) {
		(streamParams as { options?: CALL_OPTIONS }).options = input.options;
	}

	const streamResult = await input.agent.stream(streamParams);

	return {
		stream: streamResult.toUIMessageStream({
			originalMessages: validatedMessages,
			sendReasoning: true,
			sendSources: true,
		}) as unknown as ReadableStream<UI_CHUNK>,
		validatedMessages,
	};
}

export interface NormalizeAgentUIChunkStreamOptions {
	hideStepLifecycleChunks?: boolean;
	hiddenToolNames?: Iterable<string>;
}

function shouldSuppressChunk(
	chunk: UIMessageChunk,
	options: { hideStepLifecycleChunks: boolean; hiddenToolNames: Set<string> },
	hiddenToolCallIds: Set<string>,
): boolean {
	const chunkType = asString((chunk as { type?: unknown }).type);
	if (!chunkType) {
		return false;
	}

	if (
		options.hideStepLifecycleChunks &&
		STEP_LIFECYCLE_CHUNK_TYPES.has(chunkType)
	) {
		return true;
	}

	switch (chunkType) {
		case "tool-input-start":
		case "tool-input-available":
		case "tool-input-error": {
			const toolName = asString((chunk as { toolName?: unknown }).toolName);
			const toolCallId = asString(
				(chunk as { toolCallId?: unknown }).toolCallId,
			);
			if (toolName && options.hiddenToolNames.has(toolName)) {
				if (toolCallId) {
					hiddenToolCallIds.add(toolCallId);
				}
				return true;
			}
			return false;
		}
		case "tool-input-delta":
		case "tool-output-available":
		case "tool-output-error":
		case "tool-output-denied":
		case "tool-approval-request": {
			const toolCallId = asString(
				(chunk as { toolCallId?: unknown }).toolCallId,
			);
			return toolCallId ? hiddenToolCallIds.has(toolCallId) : false;
		}
		default:
			return false;
	}
}

export function normalizeAgentUIChunkStream<UI_CHUNK extends UIMessageChunk>(
	stream: ReadableStream<UI_CHUNK>,
	options: NormalizeAgentUIChunkStreamOptions = {},
): ReadableStream<UI_CHUNK> {
	const normalizedOptions: {
		hideStepLifecycleChunks: boolean;
		hiddenToolNames: Set<string>;
	} = {
		hideStepLifecycleChunks: options.hideStepLifecycleChunks ?? true,
		hiddenToolNames: new Set(options.hiddenToolNames ?? []),
	};
	const hiddenToolCallIds = new Set<string>();
	const reader = stream.getReader();

	return new ReadableStream<UI_CHUNK>({
		async pull(controller) {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					reader.releaseLock();
					controller.close();
					return;
				}
				if (!value) {
					continue;
				}
				if (
					shouldSuppressChunk(value, normalizedOptions, hiddenToolCallIds)
				) {
					continue;
				}
				controller.enqueue(value);
				return;
			}
		},
		async cancel(reason) {
			try {
				await reader.cancel(reason);
			} finally {
				reader.releaseLock();
			}
		},
	});
}

type StartEvent<TOOLS extends ToolSet> = Parameters<
	NonNullable<ToolLoopAgentOnStartCallback<TOOLS>>
>[0];

type StepStartEvent<TOOLS extends ToolSet> = Parameters<
	NonNullable<ToolLoopAgentOnStepStartCallback<TOOLS>>
>[0];

type ToolCallStartEvent<TOOLS extends ToolSet> = Parameters<
	NonNullable<ToolLoopAgentOnToolCallStartCallback<TOOLS>>
>[0];

type ToolCallFinishEvent<TOOLS extends ToolSet> = Parameters<
	NonNullable<ToolLoopAgentOnToolCallFinishCallback<TOOLS>>
>[0];

type StepFinishEvent<TOOLS extends ToolSet> = Parameters<
	NonNullable<ToolLoopAgentOnStepFinishCallback<TOOLS>>
>[0];

type FinishEvent<TOOLS extends ToolSet> = Parameters<
	NonNullable<ToolLoopAgentOnFinishCallback<TOOLS>>
>[0];

export interface AgentLoopHooks<TOOLS extends ToolSet = ToolSet> {
	experimental_onStart?: ToolLoopAgentOnStartCallback<TOOLS>;
	experimental_onStepStart?: ToolLoopAgentOnStepStartCallback<TOOLS>;
	experimental_onToolCallStart?: ToolLoopAgentOnToolCallStartCallback<TOOLS>;
	experimental_onToolCallFinish?: ToolLoopAgentOnToolCallFinishCallback<TOOLS>;
	onStepFinish?: ToolLoopAgentOnStepFinishCallback<TOOLS>;
	onFinish?: ToolLoopAgentOnFinishCallback<TOOLS>;
}

export interface AgentLoopCounters {
	steps: number;
	toolCalls: number;
	completedRuns: number;
	cancelledRuns: number;
	failedRuns: number;
}

export type AgentLoopEvent<TOOLS extends ToolSet = ToolSet> =
	| {
			type: "start";
			timestamp: number;
			event: StartEvent<TOOLS>;
	  }
	| {
			type: "step-start";
			timestamp: number;
			event: StepStartEvent<TOOLS>;
	  }
	| {
			type: "tool-call-start";
			timestamp: number;
			event: ToolCallStartEvent<TOOLS>;
	  }
	| {
			type: "tool-call-finish";
			timestamp: number;
			event: ToolCallFinishEvent<TOOLS>;
	  }
	| {
			type: "step-finish";
			timestamp: number;
			event: StepFinishEvent<TOOLS>;
	  }
	| {
			type: "finish";
			timestamp: number;
			event: FinishEvent<TOOLS>;
	  }
	| {
			type: "cancelled";
			timestamp: number;
			reason?: string;
	  }
	| {
			type: "error";
			timestamp: number;
			error: string;
	  };

export interface CreateAgentLoopInstrumentationOptions<
	TOOLS extends ToolSet = ToolSet,
> {
	now?: () => number;
	onEvent?: (event: AgentLoopEvent<TOOLS>) => void | Promise<void>;
}

export interface AgentLoopInstrumentation<TOOLS extends ToolSet = ToolSet> {
	hooks: AgentLoopHooks<TOOLS>;
	getCounters: () => AgentLoopCounters;
	recordCancelled: (reason?: string) => Promise<void>;
	recordError: (error: unknown) => Promise<void>;
}

function copyCounters(counters: AgentLoopCounters): AgentLoopCounters {
	return {
		steps: counters.steps,
		toolCalls: counters.toolCalls,
		completedRuns: counters.completedRuns,
		cancelledRuns: counters.cancelledRuns,
		failedRuns: counters.failedRuns,
	};
}

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

function createActivityEntryId(): string {
	return crypto.randomUUID();
}

function composeCallbacks<T>(
	callbacks: Array<((event: T) => void | PromiseLike<void>) | undefined>,
): ((event: T) => Promise<void>) | undefined {
	const active = callbacks.filter(
		(callback): callback is (event: T) => void | PromiseLike<void> =>
			typeof callback === "function",
	);
	if (active.length === 0) {
		return undefined;
	}
	if (active.length === 1) {
		const single = active[0];
		if (!single) {
			return undefined;
		}
		return async (event) => {
			await single(event);
		};
	}

	return async (event) => {
		for (const callback of active) {
			await callback(event);
		}
	};
}

export function composeAgentLoopHooks<TOOLS extends ToolSet = ToolSet>(
	...hooks: Array<AgentLoopHooks<TOOLS> | undefined>
): AgentLoopHooks<TOOLS> {
	return {
		experimental_onStart: composeCallbacks(
			hooks.map((entry) => entry?.experimental_onStart),
		),
		experimental_onStepStart: composeCallbacks(
			hooks.map((entry) => entry?.experimental_onStepStart),
		),
		experimental_onToolCallStart: composeCallbacks(
			hooks.map((entry) => entry?.experimental_onToolCallStart),
		),
		experimental_onToolCallFinish: composeCallbacks(
			hooks.map((entry) => entry?.experimental_onToolCallFinish),
		),
		onStepFinish: composeCallbacks(hooks.map((entry) => entry?.onStepFinish)),
		onFinish: composeCallbacks(hooks.map((entry) => entry?.onFinish)),
	};
}

export function createAgentLoopInstrumentation<TOOLS extends ToolSet = ToolSet>(
	options: CreateAgentLoopInstrumentationOptions<TOOLS> = {},
): AgentLoopInstrumentation<TOOLS> {
	const now = options.now ?? (() => Date.now());
	const onEvent = options.onEvent;
	const counters: AgentLoopCounters = {
		steps: 0,
		toolCalls: 0,
		completedRuns: 0,
		cancelledRuns: 0,
		failedRuns: 0,
	};

	const emit = async (event: AgentLoopEvent<TOOLS>): Promise<void> => {
		if (!onEvent) {
			return;
		}
		await onEvent(event);
	};

	return {
		hooks: {
			experimental_onStart: async (event) => {
				await emit({ type: "start", timestamp: now(), event });
			},
			experimental_onStepStart: async (event) => {
				counters.steps += 1;
				await emit({ type: "step-start", timestamp: now(), event });
			},
			experimental_onToolCallStart: async (event) => {
				counters.toolCalls += 1;
				await emit({ type: "tool-call-start", timestamp: now(), event });
			},
			experimental_onToolCallFinish: async (event) => {
				await emit({ type: "tool-call-finish", timestamp: now(), event });
			},
			onStepFinish: async (event) => {
				await emit({ type: "step-finish", timestamp: now(), event });
			},
			onFinish: async (event) => {
				if (event.finishReason === "error") {
					counters.failedRuns += 1;
				} else {
					counters.completedRuns += 1;
				}
				await emit({ type: "finish", timestamp: now(), event });
			},
		},
		getCounters: () => copyCounters(counters),
		recordCancelled: async (reason) => {
			counters.cancelledRuns += 1;
			await emit({ type: "cancelled", timestamp: now(), reason });
		},
		recordError: async (error) => {
			counters.failedRuns += 1;
			await emit({
				type: "error",
				timestamp: now(),
				error: toErrorMessage(error),
			});
		},
	};
}

export type AgentActivityStatus =
	| "running"
	| "completed"
	| "cancelled"
	| "error";

export interface AgentActivityEntry {
	id: string;
	source: string;
	type:
		| "start"
		| "step-start"
		| "tool-call-start"
		| "tool-call-finish"
		| "step-finish"
		| "finish"
		| "cancelled"
		| "error"
		| "note";
	timestamp: number;
	stepNumber?: number;
	toolCallId?: string;
	toolName?: string;
	input?: unknown;
	output?: unknown;
	success?: boolean;
	durationMs?: number;
	error?: string;
	message?: string;
}

export interface AgentActivitySnapshot {
	activityId: string;
	status: AgentActivityStatus;
	startedAt: number;
	updatedAt: number;
	finishedAt?: number;
	counters: AgentLoopCounters;
	entries: AgentActivityEntry[];
}

export interface CreateAgentActivityRecorderOptions {
	activityId: string;
	now?: () => number;
	onUpdate?: (snapshot: AgentActivitySnapshot) => void | Promise<void>;
	maxEntries?: number;
}

export interface AgentActivityRecorder<TOOLS extends ToolSet = ToolSet> {
	createHooks: (source?: string) => AgentLoopHooks<TOOLS>;
	addNote: (source: string, message: string) => Promise<void>;
	markCompleted: () => Promise<void>;
	markCancelled: (reason?: string) => Promise<void>;
	markError: (error: unknown) => Promise<void>;
	getSnapshot: () => AgentActivitySnapshot;
}

function cloneActivitySnapshot(
	snapshot: AgentActivitySnapshot,
): AgentActivitySnapshot {
	return {
		activityId: snapshot.activityId,
		status: snapshot.status,
		startedAt: snapshot.startedAt,
		updatedAt: snapshot.updatedAt,
		finishedAt: snapshot.finishedAt,
		counters: copyCounters(snapshot.counters),
		entries: snapshot.entries.map((entry) => ({ ...entry })),
	};
}

export function createAgentActivityRecorder<TOOLS extends ToolSet = ToolSet>(
	options: CreateAgentActivityRecorderOptions,
): AgentActivityRecorder<TOOLS> {
	const now = options.now ?? (() => Date.now());
	const maxEntries = Math.max(0, options.maxEntries ?? 500);

	const snapshot: AgentActivitySnapshot = {
		activityId: options.activityId,
		status: "running",
		startedAt: now(),
		updatedAt: now(),
		counters: {
			steps: 0,
			toolCalls: 0,
			completedRuns: 0,
			cancelledRuns: 0,
			failedRuns: 0,
		},
		entries: [],
	};

	const notify = async (): Promise<void> => {
		snapshot.updatedAt = now();
		if (!options.onUpdate) {
			return;
		}
		try {
			await options.onUpdate(cloneActivitySnapshot(snapshot));
		} catch {
			// Diagnostics should never break agent execution.
		}
	};

	const pushEntry = async (entry: AgentActivityEntry): Promise<void> => {
		snapshot.entries.push(entry);
		if (snapshot.entries.length > maxEntries) {
			snapshot.entries.splice(0, snapshot.entries.length - maxEntries);
		}
		await notify();
	};

	const createHooks = (source = "agent"): AgentLoopHooks<TOOLS> => {
		const instrumentation = createAgentLoopInstrumentation<TOOLS>({
			now,
			onEvent: async (event) => {
				switch (event.type) {
					case "start":
						await pushEntry({
							id: createActivityEntryId(),
							source,
							type: "start",
							timestamp: event.timestamp,
						});
						break;
					case "step-start":
						snapshot.counters.steps += 1;
						await pushEntry({
							id: createActivityEntryId(),
							source,
							type: "step-start",
							timestamp: event.timestamp,
							stepNumber: event.event.stepNumber,
						});
						break;
					case "tool-call-start":
						snapshot.counters.toolCalls += 1;
						await pushEntry({
							id: createActivityEntryId(),
							source,
							type: "tool-call-start",
							timestamp: event.timestamp,
							stepNumber: event.event.stepNumber,
							toolCallId: event.event.toolCall.toolCallId,
							toolName: event.event.toolCall.toolName,
							input: event.event.toolCall.input,
						});
						break;
					case "tool-call-finish":
						await pushEntry({
							id: createActivityEntryId(),
							source,
							type: "tool-call-finish",
							timestamp: event.timestamp,
							stepNumber: event.event.stepNumber,
							toolCallId: event.event.toolCall.toolCallId,
							toolName: event.event.toolCall.toolName,
							success: event.event.success,
							durationMs: event.event.durationMs,
							output: event.event.success ? event.event.output : undefined,
							error: event.event.success
								? undefined
								: toErrorMessage(event.event.error),
						});
						break;
					case "step-finish":
						await pushEntry({
							id: createActivityEntryId(),
							source,
							type: "step-finish",
							timestamp: event.timestamp,
							stepNumber: event.event.stepNumber,
						});
						break;
					case "finish":
						if (event.event.finishReason === "error") {
							snapshot.counters.failedRuns += 1;
						} else {
							snapshot.counters.completedRuns += 1;
						}
						if (snapshot.status === "running") {
							snapshot.status = "completed";
							snapshot.finishedAt = event.timestamp;
						}
						await pushEntry({
							id: createActivityEntryId(),
							source,
							type: "finish",
							timestamp: event.timestamp,
							message: event.event.finishReason,
						});
						break;
					case "cancelled":
						snapshot.counters.cancelledRuns += 1;
						snapshot.status = "cancelled";
						snapshot.finishedAt = event.timestamp;
						await pushEntry({
							id: createActivityEntryId(),
							source,
							type: "cancelled",
							timestamp: event.timestamp,
							message: event.reason,
						});
						break;
					case "error":
						snapshot.counters.failedRuns += 1;
						snapshot.status = "error";
						snapshot.finishedAt = event.timestamp;
						await pushEntry({
							id: createActivityEntryId(),
							source,
							type: "error",
							timestamp: event.timestamp,
							error: event.error,
						});
						break;
				}
			},
		});

		return instrumentation.hooks;
	};

	return {
		createHooks,
		addNote: async (source, message) => {
			await pushEntry({
				id: createActivityEntryId(),
				source,
				type: "note",
				timestamp: now(),
				message,
			});
		},
		markCompleted: async () => {
			snapshot.status = "completed";
			snapshot.finishedAt = now();
			await notify();
		},
		markCancelled: async (reason) => {
			snapshot.status = "cancelled";
			snapshot.finishedAt = now();
			await pushEntry({
				id: createActivityEntryId(),
				source: "agent",
				type: "cancelled",
				timestamp: snapshot.finishedAt,
				message: reason,
			});
		},
		markError: async (error) => {
			snapshot.status = "error";
			snapshot.finishedAt = now();
			await pushEntry({
				id: createActivityEntryId(),
				source: "agent",
				type: "error",
				timestamp: snapshot.finishedAt,
				error: toErrorMessage(error),
			});
		},
		getSnapshot: () => cloneActivitySnapshot(snapshot),
	};
}

export interface RunSubagentUIMessageStreamOptions<
	UI_MESSAGE extends UIMessage,
	CALL_OPTIONS,
	TOOLS extends ToolSet,
> {
	agent: Agent<CALL_OPTIONS, TOOLS, any>;
	uiMessages: UI_MESSAGE[];
	options?: CALL_OPTIONS;
	abortSignal?: AbortSignal;
	timeout?: TimeoutConfiguration;
	hooks?: AgentLoopHooks<TOOLS>;
	onPartialMessage?: (message: UI_MESSAGE) => void | Promise<void>;
	onError?: (error: unknown) => void;
	terminateOnError?: boolean;
}

export interface RunSubagentUIMessageStreamResult<UI_MESSAGE extends UIMessage> {
	finalMessage: UI_MESSAGE | undefined;
	partialCount: number;
}

export async function runSubagentUIMessageStream<
	UI_MESSAGE extends UIMessage,
	CALL_OPTIONS = never,
	TOOLS extends ToolSet = ToolSet,
>(
	input: RunSubagentUIMessageStreamOptions<UI_MESSAGE, CALL_OPTIONS, TOOLS>,
): Promise<RunSubagentUIMessageStreamResult<UI_MESSAGE>> {
	const { stream: uiChunkStream, validatedMessages } =
		await createAgentLoopUIChunkStream<UI_MESSAGE, CALL_OPTIONS, TOOLS>({
			agent: input.agent,
			uiMessages: input.uiMessages,
			options: input.options,
			abortSignal: input.abortSignal,
			timeout: input.timeout,
			hooks: input.hooks,
		});

	const seedMessage = [...validatedMessages]
		.reverse()
		.find((message) => message.role === "assistant") as UI_MESSAGE | undefined;

	const partialStream = readUIMessageStream<UI_MESSAGE>({
		message: seedMessage,
		stream: uiChunkStream as ReadableStream<UIMessageChunk>,
		onError: input.onError,
		terminateOnError: input.terminateOnError ?? false,
	});

	let finalMessage: UI_MESSAGE | undefined;
	let partialCount = 0;

	for await (const partial of partialStream) {
		partialCount += 1;
		finalMessage = partial;
		if (input.onPartialMessage) {
			await input.onPartialMessage(partial);
		}
	}

	return {
		finalMessage,
		partialCount,
	};
}
