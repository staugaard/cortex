import { describe, expect, test } from "bun:test";
import type { UIMessage, UIMessageChunk } from "ai";
import { createBunChatRunController } from "../src/transport-bun";

function startChunk(messageId: string): UIMessageChunk {
	return { type: "start", messageId } as UIMessageChunk;
}

describe("createBunChatRunController", () => {
	test("streams chunks and completes run", async () => {
		const chunks: Array<{ chatId: string; runId: string; chunk: UIMessageChunk }> =
			[];
		const done: Array<{ chatId: string; runId: string; reason: string }> = [];
		const errors: string[] = [];

		const controller = createBunChatRunController<UIMessage, UIMessageChunk>({
			createUIMessageStream: async () =>
				new ReadableStream<UIMessageChunk>({
					start(streamController) {
						streamController.enqueue(startChunk("m1"));
						streamController.close();
					},
				}),
			sendChunk: (payload) => chunks.push(payload),
			sendDone: (payload) => done.push(payload),
			sendError: (payload) => errors.push(payload.error),
		});

		controller.startRun({ chatId: "chat-a", runId: "run-a", messages: [] });
		await Bun.sleep(10);

		expect(chunks.length).toBe(1);
		expect(chunks[0]?.chatId).toBe("chat-a");
		expect(chunks[0]?.runId).toBe("run-a");
		expect(done).toEqual([
			{ chatId: "chat-a", runId: "run-a", reason: "completed" },
		]);
		expect(errors).toEqual([]);
	});

	test("cancelRun aborts and emits cancelled done", async () => {
		const done: Array<{ chatId: string; runId: string; reason: string }> = [];

		const controller = createBunChatRunController<UIMessage, UIMessageChunk>({
			createUIMessageStream: async ({ abortSignal }) =>
				new ReadableStream<UIMessageChunk>({
					start(streamController) {
						streamController.enqueue(startChunk("m2"));
						abortSignal.addEventListener("abort", () => {
							streamController.error(new Error("aborted"));
						});
					},
				}),
			sendChunk: () => {},
			sendDone: (payload) => done.push(payload),
			sendError: () => {},
		});

		controller.startRun({ chatId: "chat-b", runId: "run-b", messages: [] });
		await Bun.sleep(5);
		controller.cancelRun({ chatId: "chat-b", runId: "run-b" });
		await Bun.sleep(10);

		expect(done).toContainEqual({
			chatId: "chat-b",
			runId: "run-b",
			reason: "cancelled",
		});
	});

	test("emits agent error when stream creation fails", async () => {
		const errors: string[] = [];
		const done: Array<{ chatId: string; runId: string; reason: string }> = [];

		const controller = createBunChatRunController<UIMessage, UIMessageChunk>({
			createUIMessageStream: async () => {
				throw new Error("stream failed");
			},
			sendChunk: () => {},
			sendDone: (payload) => done.push(payload),
			sendError: (payload) => errors.push(payload.error),
		});

		controller.startRun({ chatId: "chat-c", runId: "run-c", messages: [] });
		await Bun.sleep(10);

		expect(errors).toEqual(["stream failed"]);
		expect(done).toEqual([]);
	});

	test("drops stale chunks when newer run supersedes existing run", async () => {
		const chunks: Array<{ chatId: string; runId: string; chunk: UIMessageChunk }> =
			[];
		const done: Array<{ chatId: string; runId: string; reason: string }> = [];

		let call = 0;
		const controller = createBunChatRunController<UIMessage, UIMessageChunk>({
			createUIMessageStream: async ({ abortSignal }) => {
				call += 1;
				const currentCall = call;
				return new ReadableStream<UIMessageChunk>({
					start(streamController) {
						const timer = setTimeout(() => {
							streamController.enqueue(startChunk(`m-${currentCall}`));
							streamController.close();
						}, currentCall === 1 ? 30 : 5);
						abortSignal.addEventListener("abort", () => {
							clearTimeout(timer);
							streamController.error(new Error("aborted"));
						});
					},
				});
			},
			sendChunk: (payload) => chunks.push(payload),
			sendDone: (payload) => done.push(payload),
			sendError: () => {},
		});

		controller.startRun({ chatId: "chat-d", runId: "run-1", messages: [] });
		await Bun.sleep(1);
		controller.startRun({ chatId: "chat-d", runId: "run-2", messages: [] });
		await Bun.sleep(60);

		expect(chunks.every((chunk) => chunk.runId === "run-2")).toBe(true);
		expect(done).toContainEqual({
			chatId: "chat-d",
			runId: "run-1",
			reason: "cancelled",
		});
		expect(done).toContainEqual({
			chatId: "chat-d",
			runId: "run-2",
			reason: "completed",
		});
	});
});
