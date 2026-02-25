import "./setup-dom";
import { describe, expect, mock, test } from "bun:test";
import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UIMessage } from "ai";

type TestMessage = UIMessage;

let useChatState: {
	messages: TestMessage[];
	sendMessage: (input: { text: string }) => void;
	setMessages: (messages: TestMessage[]) => void;
	status: "ready" | "submitted" | "streaming" | "error";
	error: Error | undefined;
	clearError: () => void;
	stop: () => void;
	addToolApprovalResponse: (input: {
		id: string;
		approved: boolean;
		reason?: string;
	}) => Promise<void>;
};

mock.module("@ai-sdk/react", () => ({
	useChat: () => useChatState,
}));

const { ChatConversation } = await import("../../src/react/chat-conversation");

const noopTransport = {
	sendMessages: async () => new ReadableStream(),
	reconnectToStream: async () => null,
} as any;

function textMessage(id: string, role: "user" | "assistant", text: string): TestMessage {
	return {
		id,
		role,
		parts: [{ type: "text", text }],
	};
}

describe("ChatConversation", () => {
	test("renders empty state and composer override", async () => {
		useChatState = {
			messages: [],
			sendMessage: () => {},
			setMessages: () => {},
			status: "ready",
			error: undefined,
			clearError: () => {},
			stop: () => {},
			addToolApprovalResponse: async () => {},
		};

		const view = render(
			<ChatConversation
				chatId="chat-1"
				transport={noopTransport}
				messages={[]}
				onMessagesChange={() => {}}
				renderComposer={() => <div>custom composer</div>}
			/>,
		);

		expect(await view.findByText("New Conversation")).toBeTruthy();
		expect(view.getByText("custom composer")).toBeTruthy();
	});

	test("calls onMessagesChange when useChat stream state differs", async () => {
		const calls: TestMessage[][] = [];
		useChatState = {
			messages: [textMessage("m1", "assistant", "hello")],
			sendMessage: () => {},
			setMessages: () => {},
			status: "ready",
			error: undefined,
			clearError: () => {},
			stop: () => {},
			addToolApprovalResponse: async () => {},
		};

		render(
			<ChatConversation
				chatId="chat-2"
				transport={noopTransport}
				messages={[]}
				onMessagesChange={(messages) => calls.push(messages)}
			/>,
		);

		await waitFor(() => {
			expect(calls.length).toBeGreaterThan(0);
		});
		expect(calls[calls.length - 1]?.[0]?.id).toBe("m1");
	});

	test("invokes onToolApproval for approval-requested tool parts", async () => {
		const approvals: Array<{ approvalId: string; approved: boolean }> = [];
		useChatState = {
			messages: [
				{
					id: "m-tool",
					role: "assistant",
					parts: [
						{
							type: "dynamic-tool",
							toolName: "dangerous_tool",
							toolCallId: "tc1",
							state: "approval-requested",
							input: { value: 1 },
							approval: {
								id: "approval-1",
								toolName: "dangerous_tool",
								input: { value: 1 },
							},
						},
					],
				} as unknown as UIMessage,
			],
			sendMessage: () => {},
			setMessages: () => {},
			status: "ready",
			error: undefined,
			clearError: () => {},
			stop: () => {},
			addToolApprovalResponse: async () => {},
		};

		const view = render(
			<ChatConversation
				chatId="chat-3"
				transport={noopTransport}
				messages={[]}
				onMessagesChange={() => {}}
				renderToolPart={({ onApprove }) => (
					<button
						type="button"
						onClick={() => onApprove("approval-1")}
					>
						approve override
					</button>
				)}
				onToolApproval={({ approvalId, approved }) => {
					approvals.push({ approvalId, approved });
				}}
			/>,
		);

		const user = userEvent.setup();
		await user.click(await view.findByRole("button", { name: "approve override" }));

		expect(approvals).toContainEqual({
			approvalId: "approval-1",
			approved: true,
		});
	});
});
