import { describe, expect, test } from "bun:test";
import type { UIMessage, UIMessageChunk } from "ai";
import {
	createElectrobunChatTransport,
	type ElectrobunChatTransportDeps,
} from "../src/transport-web";

type ChunkHandler = (payload: {
	chatId: string;
	runId: string;
	chunk: UIMessageChunk;
}) => void;
type DoneHandler = (payload: {
	chatId: string;
	runId: string;
	reason: "completed" | "cancelled";
}) => void;
type ErrorHandler = (payload: {
	chatId: string;
	runId: string;
	error: string;
}) => void;

function createHarness() {
	const sentStart: Array<{ chatId: string; runId: string; messages: UIMessage[] }> =
		[];
	const sentCancel: Array<{ chatId: string; runId: string }> = [];

	const chunkHandlers = new Set<ChunkHandler>();
	const doneHandlers = new Set<DoneHandler>();
	const errorHandlers = new Set<ErrorHandler>();

	const deps: ElectrobunChatTransportDeps<UIMessage> = {
		sendStart: (payload) => sentStart.push(payload),
		sendCancel: (payload) => sentCancel.push(payload),
		subscribeChunk: (handler) => {
			chunkHandlers.add(handler);
			return () => chunkHandlers.delete(handler);
		},
		subscribeDone: (handler) => {
			doneHandlers.add(handler);
			return () => doneHandlers.delete(handler);
		},
		subscribeError: (handler) => {
			errorHandlers.add(handler);
			return () => errorHandlers.delete(handler);
		},
		generateRunId: () => "run-fixed",
	};

	const transport = createElectrobunChatTransport(deps);

	return {
		transport,
		sentStart,
		sentCancel,
		emitChunk: (payload: { chatId: string; runId: string; chunk: UIMessageChunk }) => {
			for (const handler of chunkHandlers) {
				handler(payload);
			}
		},
		emitDone: (payload: {
			chatId: string;
			runId: string;
			reason: "completed" | "cancelled";
		}) => {
			for (const handler of doneHandlers) {
				handler(payload);
			}
		},
		emitError: (payload: { chatId: string; runId: string; error: string }) => {
			for (const handler of errorHandlers) {
				handler(payload);
			}
		},
	};
}

function startChunk(messageId: string): UIMessageChunk {
	return { type: "start", messageId } as UIMessageChunk;
}

describe("ElectrobunChatTransport", () => {
	test("sends start, forwards chunks, and closes on done", async () => {
		const harness = createHarness();
		const stream = await harness.transport.sendMessages({
			trigger: "submit-message",
			chatId: "chat-1",
			messageId: undefined,
			messages: [],
			abortSignal: undefined,
		});

		const reader = stream.getReader();
		expect(harness.sentStart).toEqual([
			{ chatId: "chat-1", runId: "run-fixed", messages: [] },
		]);

		harness.emitChunk({
			chatId: "chat-1",
			runId: "run-fixed",
			chunk: startChunk("m1"),
		});

		const first = await reader.read();
		expect(first.done).toBe(false);
		expect(first.value).toEqual(startChunk("m1"));

		harness.emitDone({
			chatId: "chat-1",
			runId: "run-fixed",
			reason: "completed",
		});
		const second = await reader.read();
		expect(second.done).toBe(true);
	});

	test("sends cancel and closes stream on abort", async () => {
		const harness = createHarness();
		const abortController = new AbortController();
		const stream = await harness.transport.sendMessages({
			trigger: "submit-message",
			chatId: "chat-2",
			messageId: undefined,
			messages: [],
			abortSignal: abortController.signal,
		});

		const reader = stream.getReader();
		abortController.abort();

		const result = await reader.read();
		expect(result.done).toBe(true);
		expect(harness.sentCancel).toContainEqual({
			chatId: "chat-2",
			runId: "run-fixed",
		});
	});

	test("errors stream on agentError message", async () => {
		const harness = createHarness();
		const stream = await harness.transport.sendMessages({
			trigger: "submit-message",
			chatId: "chat-3",
			messageId: undefined,
			messages: [],
			abortSignal: undefined,
		});

		const reader = stream.getReader();
		harness.emitError({
			chatId: "chat-3",
			runId: "run-fixed",
			error: "agent exploded",
		});

		await expect(reader.read()).rejects.toThrow("agent exploded");
	});

	test("ignores stale events with mismatched run id", async () => {
		const harness = createHarness();
		const stream = await harness.transport.sendMessages({
			trigger: "submit-message",
			chatId: "chat-4",
			messageId: undefined,
			messages: [],
			abortSignal: undefined,
		});

		const reader = stream.getReader();
		harness.emitChunk({
			chatId: "chat-4",
			runId: "other-run",
			chunk: startChunk("m-stale"),
		});
		harness.emitDone({
			chatId: "chat-4",
			runId: "run-fixed",
			reason: "completed",
		});

		const result = await reader.read();
		expect(result.done).toBe(true);
	});
});
