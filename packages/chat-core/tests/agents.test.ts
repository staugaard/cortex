import { describe, expect, test } from "bun:test";
import type { Agent, Output, ToolSet, UIMessage, UIMessageChunk } from "ai";
import {
	composeAgentLoopHooks,
	createAgentActivityRecorder,
	createAgentLoopUIChunkStream,
	createAgentLoopInstrumentation,
	normalizeAgentUIChunkStream,
	runSubagentUIMessageStream,
	sanitizeUIMessagesForModelInput,
} from "../src/agents";

function createUserMessage(text: string): UIMessage {
	return {
		id: crypto.randomUUID(),
		role: "user",
		parts: [{ type: "text", text }],
	};
}

function createAssistantChunkStream(text: string): ReadableStream<UIMessageChunk> {
	return new ReadableStream<UIMessageChunk>({
		start(controller) {
			controller.enqueue({ type: "start", messageId: "assistant-1" });
			controller.enqueue({ type: "text-start", id: "text-1" });
			controller.enqueue({
				type: "text-delta",
				id: "text-1",
				delta: text,
			});
			controller.enqueue({ type: "text-end", id: "text-1" });
			controller.enqueue({ type: "finish", finishReason: "stop" });
			controller.close();
		},
	});
}

function createMockAgent(
	text: string,
	hooksCapture?: {
		onStart?: boolean;
		onStepStart?: boolean;
		onToolCallStart?: boolean;
		onToolCallFinish?: boolean;
		onStepFinish?: boolean;
		onFinish?: boolean;
	},
): Agent<never, ToolSet, Output> {
	return {
		version: "agent-v1",
		id: "mock-agent",
		tools: {},
		generate: async () => {
			throw new Error("not used");
		},
		stream: async (options) => {
			await options.experimental_onStart?.({} as never);
			await options.experimental_onStepStart?.({ stepNumber: 0 } as never);
			await options.experimental_onToolCallStart?.({
				stepNumber: 0,
				toolCall: {
					toolCallId: "call-1",
					toolName: "mockTool",
					input: { text: "input" },
					type: "tool-call",
				},
			} as never);
			await options.experimental_onToolCallFinish?.({
				stepNumber: 0,
				success: true,
				durationMs: 5,
				toolCall: {
					toolCallId: "call-1",
					toolName: "mockTool",
					input: { text: "input" },
					type: "tool-call",
				},
				output: { ok: true },
			} as never);
			await options.onStepFinish?.({ stepNumber: 0 } as never);
			await options.onFinish?.({ finishReason: "stop", stepNumber: 0 } as never);

			hooksCapture &&
				Object.assign(hooksCapture, {
					onStart: options.experimental_onStart != null,
					onStepStart: options.experimental_onStepStart != null,
					onToolCallStart: options.experimental_onToolCallStart != null,
					onToolCallFinish: options.experimental_onToolCallFinish != null,
					onStepFinish: options.onStepFinish != null,
					onFinish: options.onFinish != null,
				});

			return {
				toUIMessageStream: () => createAssistantChunkStream(text),
			} as never;
		},
	};
}

function extractText(message: UIMessage | undefined): string {
	if (!message) {
		return "";
	}
	return message.parts
		.filter((part): part is { type: "text"; text: string } =>
			part.type === "text",
		)
		.map((part) => part.text)
		.join(" ")
		.trim();
}

function streamFromChunks(
	chunks: UIMessageChunk[],
): ReadableStream<UIMessageChunk> {
	return new ReadableStream<UIMessageChunk>({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(chunk);
			}
			controller.close();
		},
	});
}

async function readChunks(
	stream: ReadableStream<UIMessageChunk>,
): Promise<UIMessageChunk[]> {
	const reader = stream.getReader();
	const chunks: UIMessageChunk[] = [];

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			if (value) {
				chunks.push(value);
			}
		}
	} finally {
		reader.releaseLock();
	}

	return chunks;
}

describe("runSubagentUIMessageStream", () => {
	test("captures partial updates and final assistant message", async () => {
		const partials: UIMessage[] = [];
		const hooksCapture: {
			onStart?: boolean;
			onStepStart?: boolean;
			onToolCallStart?: boolean;
			onToolCallFinish?: boolean;
			onStepFinish?: boolean;
			onFinish?: boolean;
		} = {};

		const result = await runSubagentUIMessageStream({
			agent: createMockAgent("hello from subagent", hooksCapture),
			uiMessages: [createUserMessage("hi")],
			hooks: {
				experimental_onStart: () => {},
				experimental_onStepStart: () => {},
				experimental_onToolCallStart: () => {},
				experimental_onToolCallFinish: () => {},
				onStepFinish: () => {},
				onFinish: () => {},
			},
			onPartialMessage: (message) => {
				partials.push(message);
			},
		});

		expect(result.partialCount).toBeGreaterThan(0);
		expect(extractText(result.finalMessage)).toBe("hello from subagent");
		expect(partials.length).toBeGreaterThan(0);
		expect(hooksCapture).toEqual({
			onStart: true,
			onStepStart: true,
			onToolCallStart: true,
			onToolCallFinish: true,
			onStepFinish: true,
			onFinish: true,
		});
	});
});

describe("createAgentLoopUIChunkStream", () => {
	test("sanitizes unsupported UI parts before validation", async () => {
		const capturedMessages: unknown[] = [];
		const streamAgent: Agent<never, ToolSet, Output> = {
			version: "agent-v1",
			id: "capture-agent",
			tools: {},
			generate: async () => {
				throw new Error("not used");
			},
			stream: async (options) => {
				capturedMessages.push(options.prompt);
				return {
					toUIMessageStream: () => createAssistantChunkStream("ok"),
				} as never;
			},
		};

		const result = await createAgentLoopUIChunkStream({
			agent: streamAgent,
			uiMessages: [
				{
					id: "u1",
					role: "user",
					parts: [
						{ type: "text", text: "hello" },
						{
							type: "data-agentActivity",
							id: "activity-1",
							data: { status: "running" },
						} as never,
					],
				},
			],
		});

		expect(result.validatedMessages).toHaveLength(1);
		expect(result.validatedMessages[0]?.parts).toEqual([
			{ type: "text", text: "hello" },
		]);
		expect(capturedMessages).toHaveLength(1);
	});
});

describe("sanitizeUIMessagesForModelInput", () => {
	test("keeps model-safe parts and approval continuation tool parts only", () => {
		const sanitized = sanitizeUIMessagesForModelInput([
			{
				id: "m1",
				role: "assistant",
				parts: [
					{ type: "text", text: "safe" },
					{
						type: "tool-get_local_time",
						toolCallId: "tool-1",
						state: "output-available",
						input: { timezone: "Europe/Copenhagen" },
						output: { timezone: "Europe/Copenhagen", localTime: "10:00:00" },
					} as never,
					{
						type: "tool-sensitive_action_preview",
						toolCallId: "tool-2",
						state: "approval-requested",
						input: { action: "delete", target: "prod invoices" },
					} as never,
					{
						type: "tool-sensitive_action_preview",
						toolCallId: "tool-3",
						state: "approval-responded",
						input: { action: "delete", target: "prod invoices" },
						approval: {
							id: "approval-3",
							approved: false,
							reason: "Not now",
						},
					} as never,
					{
						type: "data-agentActivity",
						id: "activity",
						data: { status: "running" },
					} as never,
					{ type: "reasoning", text: "thinking" } as never,
				],
			},
			{
				id: "m2",
				role: "assistant",
				parts: [{ type: "data-agentActivity", id: "x", data: {} } as never],
			},
		]);

		expect(sanitized).toEqual([
			{
				id: "m1",
				role: "assistant",
				parts: [
					{ type: "text", text: "safe" },
					{
						type: "tool-sensitive_action_preview",
						toolCallId: "tool-2",
						state: "approval-requested",
						input: { action: "delete", target: "prod invoices" },
					},
					{
						type: "tool-sensitive_action_preview",
						toolCallId: "tool-3",
						state: "approval-responded",
						input: { action: "delete", target: "prod invoices" },
						approval: {
							id: "approval-3",
							approved: false,
							reason: "Not now",
						},
					},
				],
			},
		]);
	});
});

describe("normalizeAgentUIChunkStream", () => {
	test("suppresses step lifecycle chunks by default", async () => {
		const chunks = await readChunks(
			normalizeAgentUIChunkStream(
				streamFromChunks([
					{ type: "step-start" } as never,
					{ type: "text-start", id: "t1" },
					{ type: "step-finish" } as never,
				]),
			),
		);

		expect(chunks).toEqual([{ type: "text-start", id: "t1" }]);
	});

	test("suppresses all chunks for hidden tool families", async () => {
		const chunks = await readChunks(
			normalizeAgentUIChunkStream(
				streamFromChunks([
					{
						type: "tool-input-start",
						toolName: "ask_math_expert",
						toolCallId: "tool-1",
					} as never,
					{
						type: "tool-input-delta",
						toolCallId: "tool-1",
						delta: "{",
					} as never,
					{
						type: "tool-output-available",
						toolCallId: "tool-1",
						output: "8",
					} as never,
				]),
				{ hiddenToolNames: ["ask_math_expert"] },
			),
		);

		expect(chunks).toEqual([]);
	});

	test("passes through non-hidden tool chunks", async () => {
		const chunks = await readChunks(
			normalizeAgentUIChunkStream(
				streamFromChunks([
					{
						type: "tool-input-start",
						toolName: "web_search",
						toolCallId: "tool-2",
					} as never,
					{
						type: "tool-output-available",
						toolCallId: "tool-2",
						output: "ok",
					} as never,
				]),
				{ hiddenToolNames: ["ask_math_expert"] },
			),
		);

		expect(chunks).toEqual([
			{
				type: "tool-input-start",
				toolName: "web_search",
				toolCallId: "tool-2",
			},
			{
				type: "tool-output-available",
				toolCallId: "tool-2",
				output: "ok",
			},
		]);
	});
});

describe("composeAgentLoopHooks", () => {
	test("invokes callbacks in deterministic order", async () => {
		const calls: string[] = [];

		const combined = composeAgentLoopHooks(
			{
				onStepFinish: () => {
					calls.push("first");
				},
			},
			{
				onStepFinish: () => {
					calls.push("second");
				},
			},
		);

		await combined.onStepFinish?.({ stepNumber: 0 } as never);
		expect(calls).toEqual(["first", "second"]);
	});
});

describe("createAgentLoopInstrumentation", () => {
	test("tracks counters and emits lifecycle events", async () => {
		let nowMs = 1;
		const events: string[] = [];
		const instrumentation = createAgentLoopInstrumentation({
			now: () => nowMs++,
			onEvent: (event) => {
				events.push(event.type);
			},
		});

		await instrumentation.hooks.experimental_onStepStart?.({
			stepNumber: 0,
		} as never);
		await instrumentation.hooks.experimental_onStepStart?.({
			stepNumber: 1,
		} as never);
		await instrumentation.hooks.experimental_onToolCallStart?.({
			stepNumber: 1,
			toolCall: {
				toolCallId: "call-2",
				toolName: "lookup",
				input: { q: "abc" },
				type: "tool-call",
			},
		} as never);
		await instrumentation.hooks.onFinish?.({ finishReason: "stop" } as never);
		await instrumentation.recordCancelled("user-stop");

		expect(instrumentation.getCounters()).toEqual({
			steps: 2,
			toolCalls: 1,
			completedRuns: 1,
			cancelledRuns: 1,
			failedRuns: 0,
		});
		expect(events).toContain("step-start");
		expect(events).toContain("tool-call-start");
		expect(events).toContain("finish");
		expect(events).toContain("cancelled");
	});
});

describe("createAgentActivityRecorder", () => {
	test("emits snapshots with stable activity id and updates counters", async () => {
		const snapshots: Array<{ status: string; activityId: string; entries: number }> =
			[];
		const recorder = createAgentActivityRecorder({
			activityId: "activity-fixed",
			onUpdate: (snapshot) => {
				snapshots.push({
					status: snapshot.status,
					activityId: snapshot.activityId,
					entries: snapshot.entries.length,
				});
			},
		});

		const hooks = recorder.createHooks("subagent");
		await hooks.experimental_onStepStart?.({ stepNumber: 0 } as never);
		await hooks.experimental_onToolCallStart?.({
			stepNumber: 0,
			toolCall: {
				toolCallId: "call-3",
				toolName: "search",
				input: { q: "phase4" },
				type: "tool-call",
			},
		} as never);
		await recorder.addNote("subagent", "started delegated run");
		await recorder.markCompleted();

		const snapshot = recorder.getSnapshot();
		expect(snapshot.activityId).toBe("activity-fixed");
		expect(snapshot.status).toBe("completed");
		expect(snapshot.counters.steps).toBe(1);
		expect(snapshot.counters.toolCalls).toBe(1);
		expect(snapshot.entries.some((entry) => entry.source === "subagent")).toBe(
			true,
		);
		expect(snapshots.every((item) => item.activityId === "activity-fixed")).toBe(
			true,
		);
	});
});
