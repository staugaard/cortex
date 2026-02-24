import { ToolLoopAgent, convertToModelMessages, jsonSchema, stepCountIs, tool, validateUIMessages, type Agent, type ToolSet } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import {
	createAgentActivityRecorder,
	type AgentActivitySnapshot,
	type AgentLoopHooks,
	runSubagentUIMessageStream,
} from "@cortex/chat-core/agents";
import type {
	AgentActivityData,
	AgentActivityWorkflow,
	ChatUIChunk,
	ChatUIMessage,
} from "../mainview/chat-types";

export const CHAT_MODEL_ID = "claude-sonnet-4-6";
const INTERNAL_TOOL_NAMES = new Set(["ask_math_expert"]);

const mathExpertAgent = new ToolLoopAgent({
	model: anthropic(CHAT_MODEL_ID),
	instructions:
		"You are a math expert subagent. Solve arithmetic, algebra, calculus, probability, and unit-conversion tasks step by step. Return a concise final answer that includes the key working.",
});

export interface CreateChatRunUIChunkStreamInput {
	chatId: string;
	runId: string;
	messages: ChatUIMessage[];
	abortSignal: AbortSignal;
	onActivityUpdate: (activity: AgentActivityData) => void;
}

function shouldKeepPartForModel(part: ChatUIMessage["parts"][number]): boolean {
	switch (part.type) {
		case "text":
		case "reasoning":
		case "file":
		case "source-url":
		case "source-document":
			return true;
		default:
			return false;
	}
}

function sanitizeMessagesForModel(messages: ChatUIMessage[]): ChatUIMessage[] {
	const sanitized: ChatUIMessage[] = [];

	for (const message of messages) {
		const nextParts = message.parts
			.filter((part) => shouldKeepPartForModel(part))
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

function extractTextFromMessage(message: ChatUIMessage | undefined): string {
	if (!message) {
		return "";
	}

	return message.parts
		.filter(
			(part): part is Extract<typeof part, { type: "text" }> =>
				part.type === "text",
		)
		.map((part) => part.text)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();
}

function createSubagentPromptMessage(text: string): ChatUIMessage {
	return {
		id: crypto.randomUUID(),
		role: "user",
		parts: [{ type: "text", text }],
	};
}

function toAgentActivityData(input: {
	workflow: AgentActivityWorkflow;
	snapshot: AgentActivitySnapshot;
	prompt?: string;
	output?: string;
}): AgentActivityData {
	const filteredEvents = input.snapshot.entries.filter(
		(event) =>
			event.source === "subagent" ||
			event.type === "error" ||
			event.type === "cancelled",
	);
	const counters = {
		steps: filteredEvents.filter((event) => event.type === "step-start").length,
		toolCalls: filteredEvents.filter((event) => event.type === "tool-call-start")
			.length,
		completedRuns: input.snapshot.status === "completed" ? 1 : 0,
		cancelledRuns: input.snapshot.status === "cancelled" ? 1 : 0,
		failedRuns: input.snapshot.status === "error" ? 1 : 0,
	};

	return {
		activityId: input.snapshot.activityId,
		workflow: input.workflow,
		status: input.snapshot.status,
		prompt: input.prompt,
		output: input.output,
		startedAt: input.snapshot.startedAt,
		updatedAt: input.snapshot.updatedAt,
		finishedAt: input.snapshot.finishedAt,
		counters,
		events: filteredEvents.map((event) => ({ ...event })),
	};
}

function createManagerAgent(input: {
	onDelegate: (query: string) => Promise<void>;
	onRedundantDelegate?: () => Promise<void>;
	runSubagent: (query: string, abortSignal?: AbortSignal) => Promise<string>;
}) {
	let delegatedResult: string | undefined;
	const mathToolName = "ask_math_expert";

	return new ToolLoopAgent({
		model: anthropic(CHAT_MODEL_ID),
		instructions:
			"You are a root assistant with access to one specialist tool. For normal non-math requests, answer directly. For anything involving calculations, equations, numeric reasoning, probabilities, or unit conversions, call ask_math_expert exactly once and then produce the final response.",
		stopWhen: stepCountIs(8),
		prepareStep: ({ steps }) => {
			const alreadyDelegated = steps.some((step) =>
				step.toolCalls.some((call) => call.toolName === mathToolName),
			);
			if (!alreadyDelegated) {
				return;
			}
			return {
				activeTools: [],
				toolChoice: "none",
			};
		},
		tools: {
			ask_math_expert: tool<{ query: string }, string>({
				description:
					"Ask the math expert to solve a math-focused user request and return the expert's answer.",
				inputSchema: jsonSchema<{ query: string }>({
					type: "object",
					properties: {
						query: {
							type: "string",
							description: "The exact user request to solve.",
						},
					},
					required: ["query"],
					additionalProperties: false,
				}),
				execute: async ({ query }, options) => {
					if (delegatedResult !== undefined) {
						if (input.onRedundantDelegate) {
							await input.onRedundantDelegate();
						}
						return delegatedResult;
					}

					await input.onDelegate(query);
					delegatedResult = await input.runSubagent(query, options.abortSignal);
					return delegatedResult;
				},
			}),
		},
	});
}

async function createAgentChunkStreamWithHooks<
	CALL_OPTIONS = never,
	TOOLS extends ToolSet = ToolSet,
>(input: {
	agent: Agent<CALL_OPTIONS, TOOLS, any>;
	uiMessages: ChatUIMessage[];
	abortSignal?: AbortSignal;
	hooks?: AgentLoopHooks<TOOLS>;
	options?: CALL_OPTIONS;
}): Promise<ReadableStream<ChatUIChunk>> {
	const validatedMessages = (await validateUIMessages({
		messages: sanitizeMessagesForModel(input.uiMessages),
		tools: input.agent.tools as any,
	})) as ChatUIMessage[];

	const modelMessages = await convertToModelMessages(validatedMessages, {
		tools: input.agent.tools as any,
	});

	const result = await input.agent.stream({
		prompt: modelMessages,
		options: input.options as CALL_OPTIONS,
		abortSignal: input.abortSignal,
		experimental_onStart: input.hooks?.experimental_onStart,
		experimental_onStepStart: input.hooks?.experimental_onStepStart,
		experimental_onToolCallStart: input.hooks?.experimental_onToolCallStart,
		experimental_onToolCallFinish: input.hooks?.experimental_onToolCallFinish,
		onStepFinish: input.hooks?.onStepFinish,
		onFinish: input.hooks?.onFinish,
	});

	return result.toUIMessageStream({
		originalMessages: validatedMessages,
	}) as ReadableStream<ChatUIChunk>;
}

function shouldSuppressInternalToolChunk(
	chunk: ChatUIChunk,
	internalToolCallIds: Set<string>,
): boolean {
	const chunkType = chunk.type as string;
	if (
		chunkType === "start-step" ||
		chunkType === "finish-step" ||
		chunkType === "step-start" ||
		chunkType === "step-finish"
	) {
		return true;
	}

	switch (chunk.type) {
		case "tool-input-start":
		case "tool-input-available":
		case "tool-input-error":
			if (INTERNAL_TOOL_NAMES.has(chunk.toolName)) {
				internalToolCallIds.add(chunk.toolCallId);
				return true;
			}
			return false;
		case "tool-input-delta":
		case "tool-output-available":
		case "tool-output-error":
		case "tool-output-denied":
		case "tool-approval-request":
			return internalToolCallIds.has(chunk.toolCallId);
		default:
			return false;
	}
}

function filterInternalToolChunks(
	stream: ReadableStream<ChatUIChunk>,
): ReadableStream<ChatUIChunk> {
	const reader = stream.getReader();
	const internalToolCallIds = new Set<string>();

	return new ReadableStream<ChatUIChunk>({
		async pull(controller) {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					reader.releaseLock();
					controller.close();
					return;
				}
				if (value && shouldSuppressInternalToolChunk(value, internalToolCallIds)) {
					continue;
				}
				if (value) {
					controller.enqueue(value);
				}
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

export async function createChatRunUIChunkStream(
	input: CreateChatRunUIChunkStreamInput,
): Promise<ReadableStream<ChatUIChunk>> {
	const activityId = `agent-activity:${input.runId}`;
	let resolvedWorkflow: AgentActivityWorkflow = "direct";
	let hasDelegated = false;
	let delegatedPrompt: string | undefined;
	let delegatedOutput: string | undefined;

	const safeEmitActivity = (snapshot: AgentActivitySnapshot): void => {
		if (!hasDelegated) {
			return;
		}

		try {
			input.onActivityUpdate(
				toAgentActivityData({
					snapshot,
					workflow: resolvedWorkflow,
					prompt: delegatedPrompt,
					output: delegatedOutput,
				}),
			);
		} catch {
			// Diagnostic updates should not break agent streaming.
		}
	};

	const activityRecorder = createAgentActivityRecorder({
		activityId,
		onUpdate: (snapshot) => {
			safeEmitActivity(snapshot);
		},
	});

	const managerHooks = activityRecorder.createHooks("manager");
	const subagentHooks = activityRecorder.createHooks("subagent");

	input.abortSignal.addEventListener(
		"abort",
		() => {
			void activityRecorder.markCancelled("Run aborted by user");
		},
		{ once: true },
	);

	const managerAgent = createManagerAgent({
		onDelegate: async (query) => {
			hasDelegated = true;
			delegatedPrompt = query;
			resolvedWorkflow = "math-expert";
			await activityRecorder.addNote("manager", "Delegating to math expert");
		},
		onRedundantDelegate: async () => {
			await activityRecorder.addNote(
				"manager",
				"Redundant math delegation call ignored; reusing prior expert result",
			);
		},
		runSubagent: async (query, abortSignal) => {
			const subagentResult = await runSubagentUIMessageStream({
				agent: mathExpertAgent,
				uiMessages: [createSubagentPromptMessage(query)],
				abortSignal: abortSignal ?? input.abortSignal,
				hooks: subagentHooks as AgentLoopHooks<{}>,
				onError: (error) => {
					void activityRecorder.markError(error);
				},
			});

			const subagentText = extractTextFromMessage(
				subagentResult.finalMessage as ChatUIMessage | undefined,
			);
			if (!subagentText) {
				await activityRecorder.addNote(
					"subagent",
					"Math expert completed with no text output",
				);
				delegatedOutput = "Math expert completed without a textual answer.";
				void safeEmitActivity(activityRecorder.getSnapshot());
				return delegatedOutput;
			}
			delegatedOutput = subagentText;
			void safeEmitActivity(activityRecorder.getSnapshot());
			return subagentText;
		},
	});

	const stream = await createAgentChunkStreamWithHooks({
		agent: managerAgent,
		uiMessages: input.messages,
		abortSignal: input.abortSignal,
		hooks: managerHooks as AgentLoopHooks<any>,
	});

	return filterInternalToolChunks(stream);
}
