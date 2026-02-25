import "./setup-dom";
import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";
import { isValidElement } from "react";
import { renderMessagePart } from "../../src/react/part-renderers";
import type { ChatToolPart } from "../../src/react/types";

const baseMessage: UIMessage = {
	id: "m1",
	role: "assistant",
	parts: [],
};

describe("renderMessagePart", () => {
	test("uses custom data renderer before default fallback", () => {
		const custom = <div>custom-data</div>;
		const result = renderMessagePart({
			part: {
				type: "data-listingCard",
				id: "listing-1",
				data: { id: "listing-1" },
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

	test("falls back to default unsupported JSON code block", () => {
		const result = renderMessagePart({
			part: {
				type: "unknown-part",
				payload: { id: 42 },
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
	});
});
