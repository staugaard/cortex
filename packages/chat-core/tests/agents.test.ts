import { describe, expect, test } from "bun:test";
import type { Agent, Output, ToolSet, UIMessage, UIMessageChunk } from "ai";
import {
	composeAgentLoopHooks,
	createAgentActivityRecorder,
	createAgentLoopInstrumentation,
	runSubagentUIMessageStream,
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
