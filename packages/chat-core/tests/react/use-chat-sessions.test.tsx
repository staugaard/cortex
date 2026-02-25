import "./setup-dom";
import { describe, expect, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
	TEMP_SESSION_PREFIX,
	useChatSessions,
} from "../../src/react/use-chat-sessions";
import type {
	ChatSessionRecord,
	ChatSessionStore,
	ChatSessionSummary,
} from "../../src/react/types";

type TestMessage = {
	id: string;
	role: "user" | "assistant";
	parts: Array<{ type: "text"; text: string }>;
};

function message(id: string, role: TestMessage["role"], text: string): TestMessage {
	return {
		id,
		role,
		parts: [{ type: "text", text }],
	};
}

class InMemorySessionStore implements ChatSessionStore<TestMessage> {
	private records = new Map<string, ChatSessionRecord<TestMessage>>();
	private tmpMap = new Map<string, string>();
	private subscribers = new Set<(session: ChatSessionSummary) => void>();
	private nextCanonicalIndex = 1;
	public throwOnList = false;
	public throwOnSave = false;

	constructor(initialRecords: ChatSessionRecord<TestMessage>[] = []) {
		for (const record of initialRecords) {
			this.records.set(record.sessionId, record);
		}
	}

	listSessions = async (): Promise<{ sessions: ChatSessionSummary[] }> => {
		if (this.throwOnList) {
			throw new Error("list failed");
		}
		return {
			sessions: Array.from(this.records.values()).map((record) => ({
				sessionId: record.sessionId,
				title: record.title,
				createdAt: record.createdAt,
				updatedAt: record.updatedAt,
			})),
		};
	};

	getSession = async (input: {
		sessionId: string;
	}): Promise<{ session: ChatSessionRecord<TestMessage> | null }> => {
		return {
			session: this.records.get(input.sessionId) ?? null,
		};
	};

	saveSession = async (input: {
		sessionId: string;
		messages: TestMessage[];
	}): Promise<{ sessionId: string; savedAt: number }> => {
		if (this.throwOnSave) {
			throw new Error("save failed");
		}
		const savedAt = Date.now();
		const sessionId = this.resolveSessionId(input.sessionId);
		const existing = this.records.get(sessionId);
		const record: ChatSessionRecord<TestMessage> = {
			sessionId,
			title: existing?.title ?? "Session",
			createdAt: existing?.createdAt ?? savedAt,
			updatedAt: savedAt,
			messages: input.messages,
		};
		this.records.set(sessionId, record);
		this.emit({
			sessionId: record.sessionId,
			title: record.title,
			createdAt: record.createdAt,
			updatedAt: record.updatedAt,
		});
		return { sessionId, savedAt };
	};

	subscribeSessionUpdated = (handler: (session: ChatSessionSummary) => void) => {
		this.subscribers.add(handler);
		return () => {
			this.subscribers.delete(handler);
		};
	};

	emit(summary: ChatSessionSummary): void {
		for (const subscriber of this.subscribers) {
			subscriber(summary);
		}
	}

	hasSession(sessionId: string): boolean {
		return this.records.has(sessionId);
	}

	private resolveSessionId(sessionId: string): string {
		if (!sessionId.startsWith(TEMP_SESSION_PREFIX)) {
			return sessionId;
		}
		const existing = this.tmpMap.get(sessionId);
		if (existing) {
			return existing;
		}
		const canonical = `canonical-${this.nextCanonicalIndex++}`;
		this.tmpMap.set(sessionId, canonical);
		return canonical;
	}
}

describe("useChatSessions", () => {
	test("creates provisional temp session on empty startup", async () => {
		const store = new InMemorySessionStore();
		const createTempSessionId = () => "tmp:initial";
		const { result } = renderHook(() =>
			useChatSessions({
				store,
				createTemporarySessionId: createTempSessionId,
			}),
		);

		await waitFor(() => {
			expect(result.current.sessions.length).toBe(1);
		});

		expect(result.current.activeSessionId).toBe("tmp:initial");
		expect(result.current.messagesForActiveSession).toEqual([]);
		expect(result.current.sessions[0]?.sessionId).toBe("tmp:initial");
	});

	test("loads most recent session and hydrates messages", async () => {
		const store = new InMemorySessionStore([
			{
				sessionId: "s-older",
				title: "Older",
				createdAt: 10,
				updatedAt: 10,
				messages: [message("m1", "user", "older")],
			},
			{
				sessionId: "s-newer",
				title: "Newer",
				createdAt: 20,
				updatedAt: 20,
				messages: [message("m2", "assistant", "newer")],
			},
		]);
		const { result } = renderHook(() =>
			useChatSessions({
				store,
			}),
		);

		await waitFor(() => {
			expect(result.current.activeSessionId).toBe("s-newer");
		});

		expect(result.current.messagesForActiveSession).toEqual([
			message("m2", "assistant", "newer"),
		]);
	});

	test("remaps temp IDs to canonical IDs while preserving active messages", async () => {
		const store = new InMemorySessionStore();
		const createTempSessionId = () => "tmp:seed";
		const { result } = renderHook(() =>
			useChatSessions({
				store,
				createTemporarySessionId: createTempSessionId,
			}),
		);

		await waitFor(() => {
			expect(result.current.activeSessionId).toBe("tmp:seed");
		});

		await act(async () => {
			result.current.setMessagesForActiveSession([
				message("m1", "user", "hello"),
			]);
		});

		await act(async () => {
			await result.current.persistActiveSession();
		});

		await waitFor(() => {
			expect(result.current.activeSessionId.startsWith("canonical-")).toBe(true);
		});

		expect(result.current.messagesForActiveSession).toEqual([
			message("m1", "user", "hello"),
		]);
		expect(store.hasSession(result.current.activeSessionId)).toBe(true);
	});

	test("selectSession persists current session and hydrates target", async () => {
		const store = new InMemorySessionStore([
			{
				sessionId: "existing",
				title: "Existing",
				createdAt: 20,
				updatedAt: 20,
				messages: [message("m-existing", "assistant", "saved")],
			},
		]);
		const createTempSessionId = () => "tmp:from-new";
		const { result } = renderHook(() =>
			useChatSessions({
				store,
				createTemporarySessionId: createTempSessionId,
			}),
		);

		await waitFor(() => {
			expect(result.current.activeSessionId).toBe("existing");
		});

		await act(async () => {
			await result.current.createNewSession();
		});
		await waitFor(() => {
			expect(result.current.activeSessionId).toBe("tmp:from-new");
		});

		await act(async () => {
			result.current.setMessagesForActiveSession([
				message("m-new", "user", "draft"),
			]);
		});

		await act(async () => {
			await result.current.selectSession("existing");
		});

		await waitFor(() => {
			expect(result.current.activeSessionId).toBe("existing");
		});

		expect(store.hasSession("canonical-1")).toBe(true);
		expect(result.current.messagesForActiveSession).toEqual([
			message("m-existing", "assistant", "saved"),
		]);
	});

	test("merges pushed session updates from subscribeSessionUpdated", async () => {
		const store = new InMemorySessionStore();
		const createTempSessionId = () => "tmp:seed";
		const { result } = renderHook(() =>
			useChatSessions({
				store,
				createTemporarySessionId: createTempSessionId,
			}),
		);

		await waitFor(() => {
			expect(result.current.sessions.length).toBe(1);
		});

		await act(async () => {
			store.emit({
				sessionId: "push-1",
				title: "Pushed",
				createdAt: 100,
				updatedAt: 100,
			});
		});

		await waitFor(() => {
			expect(
				result.current.sessions.some((session) => session.sessionId === "push-1"),
			).toBe(true);
		});
	});

	test("exposes load and save errors", async () => {
		const loadFailStore = new InMemorySessionStore();
		loadFailStore.throwOnList = true;
		const createLoadErrorTempSessionId = () => "tmp:error";
		const loadHook = renderHook(() =>
			useChatSessions({
				store: loadFailStore,
				createTemporarySessionId: createLoadErrorTempSessionId,
			}),
		);

		await waitFor(() => {
			expect(loadHook.result.current.loadError).toBe("list failed");
		});

		const saveFailStore = new InMemorySessionStore();
		saveFailStore.throwOnSave = true;
		const createSaveErrorTempSessionId = () => "tmp:save-error";
		const saveHook = renderHook(() =>
			useChatSessions({
				store: saveFailStore,
				createTemporarySessionId: createSaveErrorTempSessionId,
			}),
		);

		await waitFor(() => {
			expect(saveHook.result.current.activeSessionId).toBe("tmp:save-error");
		});

		await act(async () => {
			saveHook.result.current.setMessagesForActiveSession([
				message("m1", "user", "oops"),
			]);
		});

		await act(async () => {
			await expect(saveHook.result.current.persistActiveSession()).rejects.toThrow(
				"save failed",
			);
		});

		await waitFor(() => {
			expect(saveHook.result.current.saveError).toBe("save failed");
		});
	});
});
