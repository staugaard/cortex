import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteChatRepository } from "../src/persistence";

type TestMessage = {
	role: "user" | "assistant";
	parts: Array<{ type: "text"; text: string }>;
};

function message(role: TestMessage["role"], text: string): TestMessage {
	return {
		role,
		parts: [{ type: "text", text }],
	};
}

function createTestDbPath(): { dbPath: string; cleanup: () => void } {
	const root = mkdtempSync(join(tmpdir(), "chat-core-persistence-"));
	return {
		dbPath: join(root, "chat.sqlite"),
		cleanup: () => {
			rmSync(root, { recursive: true, force: true });
		},
	};
}

describe("createSqliteChatRepository", () => {
	test("initializes schema and migration idempotently", async () => {
		const { dbPath, cleanup } = createTestDbPath();
		try {
			const repositoryOne = createSqliteChatRepository<TestMessage>({ dbPath });
			await repositoryOne.saveMessages({
				sessionId: "session-1",
				messages: [message("user", "hello")],
			});
			repositoryOne.close();

			const repositoryTwo = createSqliteChatRepository<TestMessage>({ dbPath });
			const result = repositoryTwo.getConversationList({});
			expect(result.conversations.length).toBe(1);
			expect(result.conversations[0]?.sessionId).toBe("session-1");
			repositoryTwo.close();
		} finally {
			cleanup();
		}
	});

	test("persists and loads UI messages and metadata", async () => {
		const { dbPath, cleanup } = createTestDbPath();
		try {
			const repository = createSqliteChatRepository<TestMessage>({ dbPath });
			await repository.saveMessages({
				sessionId: "session-roundtrip",
				messages: [message("user", "ping"), message("assistant", "pong")],
				metadata: { source: "test" },
				title: "Roundtrip",
			});

			const conversation = repository.getConversation({
				sessionId: "session-roundtrip",
			}).conversation;
			expect(conversation).not.toBeNull();
			expect(conversation?.title).toBe("Roundtrip");
			expect(conversation?.metadata).toEqual({ source: "test" });
			expect(conversation?.messages).toEqual([
				message("user", "ping"),
				message("assistant", "pong"),
			]);
			repository.close();
		} finally {
			cleanup();
		}
	});

	test("returns sessions ordered by createdAt DESC and applies optional limits", async () => {
		const { dbPath, cleanup } = createTestDbPath();
		let currentTime = 10;
		try {
			const repository = createSqliteChatRepository<TestMessage>({
				dbPath,
				now: () => currentTime,
			});

			await repository.saveMessages({
				sessionId: "oldest",
				messages: [message("user", "first")],
			});
			currentTime = 20;
			await repository.saveMessages({
				sessionId: "newer",
				messages: [message("user", "second")],
			});

			const all = repository.getConversationList({});
			expect(all.conversations.map((c) => c.sessionId)).toEqual([
				"newer",
				"oldest",
			]);

			const limited = repository.getConversationList({ limit: 1 });
			expect(limited.conversations.map((c) => c.sessionId)).toEqual(["newer"]);
			repository.close();
		} finally {
			cleanup();
		}
	});

	test("remaps tmp ids to canonical ids and reuses mapping", async () => {
		const { dbPath, cleanup } = createTestDbPath();
		let createCalls = 0;
		try {
			const repository = createSqliteChatRepository<TestMessage>({
				dbPath,
				createSessionId: () => {
					createCalls += 1;
					return "canonical-1";
				},
			});

			const firstSave = await repository.saveMessages({
				sessionId: "tmp:one",
				messages: [message("user", "first")],
			});
			expect(firstSave.sessionId).toBe("canonical-1");

			const secondSave = await repository.saveMessages({
				sessionId: "tmp:one",
				messages: [message("user", "first"), message("assistant", "done")],
			});
			expect(secondSave.sessionId).toBe("canonical-1");
			expect(createCalls).toBe(1);

			expect(
				repository.getConversation({ sessionId: "tmp:one" }).conversation,
			).toBeNull();
			expect(
				repository.getConversation({ sessionId: "canonical-1" }).conversation,
			).not.toBeNull();
			repository.close();
		} finally {
			cleanup();
		}
	});

	test("does not remap non-tmp ids", async () => {
		const { dbPath, cleanup } = createTestDbPath();
		try {
			const repository = createSqliteChatRepository<TestMessage>({
				dbPath,
				createSessionId: () => "should-not-be-used",
			});
			const save = await repository.saveMessages({
				sessionId: "fixed-id",
				messages: [message("user", "hello")],
			});
			expect(save.sessionId).toBe("fixed-id");
			repository.close();
		} finally {
			cleanup();
		}
	});

	test("calls generateTitle once for an untitled session with assistant content", async () => {
		const { dbPath, cleanup } = createTestDbPath();
		let calls = 0;
		try {
			const repository = createSqliteChatRepository<TestMessage>({
				dbPath,
				generateTitle: async () => {
					calls += 1;
					await Bun.sleep(25);
					return "Model Title";
				},
			});

			await repository.saveMessages({
				sessionId: "session-title",
				messages: [message("user", "question"), message("assistant", "answer")],
			});
			await repository.saveMessages({
				sessionId: "session-title",
				messages: [message("user", "question"), message("assistant", "answer")],
			});
			await Bun.sleep(40);

			expect(calls).toBe(1);
			expect(
				repository.getConversation({ sessionId: "session-title" }).conversation?.title,
			).toBe("Model Title");
			repository.close();
		} finally {
			cleanup();
		}
	});

	test("emits onConversationUpdated when async title generation upgrades fallback title", async () => {
		const { dbPath, cleanup } = createTestDbPath();
		const updates: Array<{
			sessionId: string;
			title: string | undefined;
			createdAt: number;
			updatedAt: number;
		}> = [];
		try {
			const repository = createSqliteChatRepository<TestMessage>({
				dbPath,
				generateTitle: async () => "Model Title",
				onConversationUpdated: (conversation) => {
					updates.push({
						sessionId: conversation.sessionId,
						title: conversation.title,
						createdAt: conversation.createdAt,
						updatedAt: conversation.updatedAt,
					});
				},
			});

			await repository.saveMessages({
				sessionId: "session-push",
				messages: [message("user", "question"), message("assistant", "answer")],
			});
			await Bun.sleep(30);

			expect(updates.length).toBe(1);
			expect(updates[0]).toEqual({
				sessionId: "session-push",
				title: "Model Title",
				createdAt: expect.any(Number),
				updatedAt: expect.any(Number),
			});
			repository.close();
		} finally {
			cleanup();
		}
	});

	test("falls back to deterministic title if generateTitle fails", async () => {
		const { dbPath, cleanup } = createTestDbPath();
		try {
			const repository = createSqliteChatRepository<TestMessage>({
				dbPath,
				generateTitle: async () => {
					throw new Error("no title");
				},
			});

			await repository.saveMessages({
				sessionId: "session-fallback",
				messages: [
					message("user", "Deterministic title from the first user message"),
					message("assistant", "response"),
				],
			});

			expect(
				repository.getConversation({ sessionId: "session-fallback" }).conversation?.title,
			).toBe("Deterministic title from the first user message");
			repository.close();
		} finally {
			cleanup();
		}
	});

	test("regenerates fallback titles until first successful non-fallback title", async () => {
		const { dbPath, cleanup } = createTestDbPath();
		let calls = 0;
		try {
			const repository = createSqliteChatRepository<TestMessage>({
				dbPath,
				generateTitle: async () => {
					calls += 1;
					if (calls < 2) {
						return undefined;
					}
					return "Final Generated Title";
				},
			});

			await repository.saveMessages({
				sessionId: "session-regenerate",
				messages: [message("user", "draft title"), message("assistant", "reply")],
			});
			await Bun.sleep(20);
			expect(
				repository.getConversation({ sessionId: "session-regenerate" }).conversation
					?.title,
			).toBe("draft title");

			await repository.saveMessages({
				sessionId: "session-regenerate",
				messages: [message("user", "draft title"), message("assistant", "reply")],
			});
			await Bun.sleep(20);
			expect(
				repository.getConversation({ sessionId: "session-regenerate" }).conversation
					?.title,
			).toBe("Final Generated Title");
			expect(calls).toBe(2);

			await repository.saveMessages({
				sessionId: "session-regenerate",
				messages: [message("user", "draft title"), message("assistant", "reply")],
			});
			await Bun.sleep(20);
			expect(calls).toBe(2);
			repository.close();
		} finally {
			cleanup();
		}
	});

	test("falls back when generateTitle exceeds configured timeout", async () => {
		const { dbPath, cleanup } = createTestDbPath();
		try {
			const repository = createSqliteChatRepository<TestMessage>({
				dbPath,
				generateTitleTimeoutMs: 10,
				generateTitle: async () => {
					return await new Promise<string>(() => {});
				},
			});

			const startedAt = Date.now();
			await repository.saveMessages({
				sessionId: "session-timeout",
				messages: [
					message("user", "Slow title request should not block save"),
					message("assistant", "response"),
				],
				});
			const elapsedMs = Date.now() - startedAt;

			expect(elapsedMs).toBeLessThan(200);
			expect(
				repository.getConversation({ sessionId: "session-timeout" }).conversation
					?.title,
			).toBe("Slow title request should not block save");
			repository.close();
		} finally {
			cleanup();
		}
	});
});
