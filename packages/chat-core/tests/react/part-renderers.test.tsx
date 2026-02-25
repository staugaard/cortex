import "./setup-dom";
import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import type { UIMessage } from "ai";
import { isValidElement } from "react";
import { renderMessagePart } from "../../src/react/part-renderers";
import type { ChatToolPart } from "../../src/react/types";

const baseMessage: UIMessage = {
	id: "m1",
	role: "assistant",
	parts: [],
};

const validAgentActivityData = {
	activityId: "act-1",
	workflow: "math-expert",
	status: "completed",
	prompt: "Solve 17 * 9",
	output: "153",
	startedAt: Date.now() - 500,
	updatedAt: Date.now(),
	counters: {
		steps: 1,
		toolCalls: 1,
		completedRuns: 1,
		cancelledRuns: 0,
		failedRuns: 0,
	},
	events: [
		{
			id: "evt-1",
			timestamp: Date.now(),
			source: "manager",
			type: "tool-call-finish",
			toolName: "solve_arithmetic",
		},
	],
};

describe("renderMessagePart", () => {
	test("uses custom data renderer before default fallback", () => {
		const custom = <div>custom-data</div>;
		const result = renderMessagePart({
			part: {
				type: "data-agentActivity",
				id: "activity-1",
				data: validAgentActivityData,
			} as UIMessage["parts"][number],
			message: baseMessage,
			messageIndex: 0,
			partIndex: 0,
			status: "ready",
			renderDataPart: () => custom,
			disableToolActions: false,
			onApproveToolCall: () => {},
			onDenyToolCall: () => {},
		});

		expect(result).toBe(custom);
	});

	test("renders default agent activity data part when valid", () => {
		const result = renderMessagePart({
			part: {
				type: "data-agentActivity",
				id: "activity-1",
				data: validAgentActivityData,
			} as UIMessage["parts"][number],
			message: baseMessage,
			messageIndex: 0,
			partIndex: 0,
			status: "ready",
			disableToolActions: false,
			onApproveToolCall: () => {},
			onDenyToolCall: () => {},
		});

		expect(isValidElement(result)).toBe(true);
		const view = render(<>{result}</>);
		expect(view.getByText("Agent")).toBeTruthy();
		expect(view.getByText("completed")).toBeTruthy();
	});

	test("uses custom tool renderer before default tool card", () => {
		const custom = <div>custom-tool</div>;
		const toolPart: ChatToolPart = {
			type: "dynamic-tool",
			toolName: "my_tool",
			toolCallId: "tc1",
			state: "output-available",
			input: { id: 1 },
			output: { ok: true },
		} as ChatToolPart;

		const result = renderMessagePart({
			part: toolPart as UIMessage["parts"][number],
			message: baseMessage,
			messageIndex: 0,
			partIndex: 0,
			status: "ready",
			renderToolPart: () => custom,
			disableToolActions: false,
			onApproveToolCall: () => {},
			onDenyToolCall: () => {},
		});

		expect(result).toBe(custom);
	});

	test("uses custom unsupported renderer when provided", () => {
		const custom = <div>custom-unsupported</div>;
		const result = renderMessagePart({
			part: {
				type: "unknown-part",
			} as UIMessage["parts"][number],
			message: baseMessage,
			messageIndex: 0,
			partIndex: 0,
			status: "ready",
			renderUnsupportedPart: () => custom,
			disableToolActions: false,
			onApproveToolCall: () => {},
			onDenyToolCall: () => {},
		});

		expect(result).toBe(custom);
	});

	test("falls back to unsupported UI when agent activity payload is malformed", () => {
		const result = renderMessagePart({
			part: {
				type: "data-agentActivity",
				id: "activity-1",
				data: { invalid: true },
			} as UIMessage["parts"][number],
			message: baseMessage,
			messageIndex: 0,
			partIndex: 0,
			status: "ready",
			disableToolActions: false,
			onApproveToolCall: () => {},
			onDenyToolCall: () => {},
		});

		expect(isValidElement(result)).toBe(true);
		const view = render(<>{result}</>);
		expect(view.container.textContent?.includes("data-agentActivity")).toBe(true);
	});
});
