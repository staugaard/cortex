import { useCallback, useEffect, useRef, useState } from "react";
import type {
	ChatSessionRecord,
	ChatSessionStore,
	ChatSessionSummary,
	UseChatSessionsResult,
} from "./types";

export const TEMP_SESSION_PREFIX = "tmp:";

export function createTemporarySessionId(): string {
	return `${TEMP_SESSION_PREFIX}${crypto.randomUUID()}`;
}

function asErrorMessage(issue: unknown): string {
	return issue instanceof Error ? issue.message : String(issue);
}

function sortSessionsByCreatedAt(
	sessions: ChatSessionSummary[],
): ChatSessionSummary[] {
	return [...sessions].sort((a, b) => b.createdAt - a.createdAt);
}

function upsertSession(
	sessions: ChatSessionSummary[],
	next: ChatSessionSummary,
): ChatSessionSummary[] {
	const withoutExisting = sessions.filter(
		(session) => session.sessionId !== next.sessionId,
	);
	return sortSessionsByCreatedAt([...withoutExisting, next]);
}

function replaceSessionId(
	sessions: ChatSessionSummary[],
	fromSessionId: string,
	toSessionId: string,
): ChatSessionSummary[] {
	return sessions.map((session) => {
		if (session.sessionId !== fromSessionId) {
			return session;
		}
		return {
			...session,
			sessionId: toSessionId,
		};
	});
}

function isTemporarySessionId(sessionId: string): boolean {
	return sessionId.startsWith(TEMP_SESSION_PREFIX);
}

function provisionalSession(sessionId: string): ChatSessionSummary {
	const now = Date.now();
	return {
		sessionId,
		title: "New Conversation",
		createdAt: now,
		updatedAt: now,
	};
}

function setSessionMessages<UI_MESSAGE>(
	messagesBySession: Record<string, UI_MESSAGE[]>,
	sessionId: string,
	messages: UI_MESSAGE[],
): Record<string, UI_MESSAGE[]> {
	if (messagesBySession[sessionId] === messages) {
		return messagesBySession;
	}
	return {
		...messagesBySession,
		[sessionId]: messages,
	};
}

function moveSessionMessages<UI_MESSAGE>(
	messagesBySession: Record<string, UI_MESSAGE[]>,
	fromSessionId: string,
	toSessionId: string,
): Record<string, UI_MESSAGE[]> {
	if (fromSessionId === toSessionId) {
		return messagesBySession;
	}
	const next = { ...messagesBySession };
	const current = next[fromSessionId];
	if (current) {
		next[toSessionId] = current;
	}
	delete next[fromSessionId];
	return next;
}

function recordToSummary<UI_MESSAGE>(
	record: ChatSessionRecord<UI_MESSAGE>,
): ChatSessionSummary {
	return {
		sessionId: record.sessionId,
		title: record.title,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	};
}

export function useChatSessions<UI_MESSAGE>(input: {
	store: ChatSessionStore<UI_MESSAGE>;
	createTemporarySessionId?: () => string;
}): UseChatSessionsResult<UI_MESSAGE> {
	const { store } = input;
	const createTmpSessionId =
		input.createTemporarySessionId ?? createTemporarySessionId;

	const [loadError, setLoadError] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [isSwitchingSession, setIsSwitchingSession] = useState(false);
	const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
	const [activeSessionId, setActiveSessionId] = useState<string>(() =>
		createTmpSessionId(),
	);
	const [messagesBySession, setMessagesBySession] = useState<
		Record<string, UI_MESSAGE[]>
	>({});

	const activeSessionIdRef = useRef(activeSessionId);
	const messagesBySessionRef = useRef(messagesBySession);
	const pendingRemapHydrationRef = useRef<{
		sessionId: string;
		messages: UI_MESSAGE[];
	} | null>(null);

	useEffect(() => {
		activeSessionIdRef.current = activeSessionId;
	}, [activeSessionId]);

	useEffect(() => {
		messagesBySessionRef.current = messagesBySession;
	}, [messagesBySession]);

	const loadSessionMessages = useCallback(
		async (sessionId: string): Promise<UI_MESSAGE[]> => {
			if (isTemporarySessionId(sessionId)) {
				setMessagesBySession((previous) =>
					setSessionMessages(previous, sessionId, []),
				);
				return [];
			}

			const result = await store.getSession({ sessionId });
			const session = result.session;
			if (session) {
				setSessions((previousSessions) =>
					upsertSession(previousSessions, recordToSummary(session)),
				);
				setMessagesBySession((previous) =>
					setSessionMessages(previous, session.sessionId, session.messages),
				);
			}
			return session?.messages ?? [];
		},
		[store],
	);

	const persistSession = useCallback(
		async (
			sessionId: string,
			nextMessages: UI_MESSAGE[],
			options?: { preserveViewOnRemap?: boolean },
		): Promise<string> => {
			if (nextMessages.length === 0 && isTemporarySessionId(sessionId)) {
				return sessionId;
			}

			const saveResult = await store.saveSession({
				sessionId,
				messages: nextMessages,
			});
			const canonicalSessionId = saveResult.sessionId;
			setSaveError(null);

			setSessions((previousSessions) => {
				const withCanonicalSession =
					canonicalSessionId === sessionId
						? previousSessions
						: replaceSessionId(
								previousSessions,
								sessionId,
								canonicalSessionId,
							);
				const existing = withCanonicalSession.find(
					(session) => session.sessionId === canonicalSessionId,
				);
				return upsertSession(withCanonicalSession, {
					sessionId: canonicalSessionId,
					title: existing?.title,
					createdAt: existing?.createdAt ?? saveResult.savedAt,
					updatedAt: saveResult.savedAt,
				});
			});

			setMessagesBySession((previous) => {
				const remapped = moveSessionMessages(
					previous,
					sessionId,
					canonicalSessionId,
				);
				return setSessionMessages(remapped, canonicalSessionId, nextMessages);
			});

			if (
				canonicalSessionId !== sessionId &&
				activeSessionIdRef.current === sessionId &&
				options?.preserveViewOnRemap
			) {
				pendingRemapHydrationRef.current = {
					sessionId: canonicalSessionId,
					messages: nextMessages,
				};
				activeSessionIdRef.current = canonicalSessionId;
				setActiveSessionId(canonicalSessionId);
			}

			const savedSessionResult = await store.getSession({
				sessionId: canonicalSessionId,
			});
			const savedSession = savedSessionResult.session;
			if (savedSession) {
				setSessions((previousSessions) =>
					upsertSession(previousSessions, recordToSummary(savedSession)),
				);
				setMessagesBySession((previous) =>
					setSessionMessages(
						previous,
						savedSession.sessionId,
						savedSession.messages,
					),
				);
			}

			return canonicalSessionId;
		},
		[store],
	);

	useEffect(() => {
		const pendingHydration = pendingRemapHydrationRef.current;
		if (!pendingHydration || pendingHydration.sessionId !== activeSessionId) {
			return;
		}
		setMessagesBySession((previous) =>
			setSessionMessages(
				previous,
				pendingHydration.sessionId,
				pendingHydration.messages,
			),
		);
		pendingRemapHydrationRef.current = null;
	}, [activeSessionId]);

	useEffect(() => {
		let isCancelled = false;

		void (async () => {
			try {
				const result = await store.listSessions({});
				if (isCancelled) {
					return;
				}

				const availableSessions = sortSessionsByCreatedAt(result.sessions);
				setLoadError(null);
				if (availableSessions.length === 0) {
					const tempSessionId = createTmpSessionId();
					activeSessionIdRef.current = tempSessionId;
					setActiveSessionId(tempSessionId);
					setSessions([provisionalSession(tempSessionId)]);
					setMessagesBySession({
						[tempSessionId]: [],
					});
					return;
				}

				const firstSessionId = availableSessions[0]!.sessionId;
				activeSessionIdRef.current = firstSessionId;
				setActiveSessionId(firstSessionId);
				setSessions(availableSessions);
				await loadSessionMessages(firstSessionId);
			} catch (issue) {
				if (!isCancelled) {
					setLoadError(asErrorMessage(issue));
				}
			}
		})();

		return () => {
			isCancelled = true;
		};
	}, [createTmpSessionId, loadSessionMessages, store]);

	useEffect(() => {
		const subscribeSessionUpdated = store.subscribeSessionUpdated;
		if (typeof subscribeSessionUpdated !== "function") {
			return;
		}

		return subscribeSessionUpdated((session) => {
			setSessions((previousSessions) => upsertSession(previousSessions, session));
		});
	}, [store]);

	const setMessagesForActiveSession = useCallback((messages: UI_MESSAGE[]) => {
		const currentActiveSessionId = activeSessionIdRef.current;
		setMessagesBySession((previous) =>
			setSessionMessages(previous, currentActiveSessionId, messages),
		);
	}, []);

	const reloadActiveSession = useCallback(async () => {
		try {
			await loadSessionMessages(activeSessionIdRef.current);
			setLoadError(null);
		} catch (issue) {
			setLoadError(asErrorMessage(issue));
		}
	}, [loadSessionMessages]);

	const selectSession = useCallback(
		async (nextSessionId: string) => {
			if (nextSessionId === activeSessionIdRef.current) {
				return;
			}

			setIsSwitchingSession(true);
			try {
				const currentSessionId = activeSessionIdRef.current;
				const currentMessages =
					messagesBySessionRef.current[currentSessionId] ?? [];
				const canonicalCurrentSessionId = await persistSession(
					currentSessionId,
					currentMessages,
				);

				const resolvedNextSessionId =
					nextSessionId === currentSessionId
						? canonicalCurrentSessionId
						: nextSessionId;

				activeSessionIdRef.current = resolvedNextSessionId;
				setActiveSessionId(resolvedNextSessionId);
				await loadSessionMessages(resolvedNextSessionId);
				setLoadError(null);
			} catch (issue) {
				setLoadError(asErrorMessage(issue));
			} finally {
				setIsSwitchingSession(false);
			}
		},
		[loadSessionMessages, persistSession],
	);

	const createNewSession = useCallback(async () => {
		setIsSwitchingSession(true);
		try {
			const currentSessionId = activeSessionIdRef.current;
			const currentMessages =
				messagesBySessionRef.current[currentSessionId] ?? [];
			await persistSession(currentSessionId, currentMessages);

			const newSessionId = createTmpSessionId();
			activeSessionIdRef.current = newSessionId;
			setActiveSessionId(newSessionId);
			setSessions((previousSessions) =>
				upsertSession(previousSessions, provisionalSession(newSessionId)),
			);
			setMessagesBySession((previous) =>
				setSessionMessages(previous, newSessionId, []),
			);
			setLoadError(null);
		} catch (issue) {
			setLoadError(asErrorMessage(issue));
		} finally {
			setIsSwitchingSession(false);
		}
	}, [createTmpSessionId, persistSession]);

	const persistActiveSession = useCallback(async () => {
		try {
			const currentSessionId = activeSessionIdRef.current;
			const currentMessages =
				messagesBySessionRef.current[currentSessionId] ?? [];
			return await persistSession(currentSessionId, currentMessages, {
				preserveViewOnRemap: true,
			});
		} catch (issue) {
			setSaveError(asErrorMessage(issue));
			throw issue;
		}
	}, [persistSession]);

	return {
		sessions,
		activeSessionId,
		messagesForActiveSession: messagesBySession[activeSessionId] ?? [],
		isSwitchingSession,
		loadError,
		saveError,
		setMessagesForActiveSession,
		createNewSession,
		selectSession,
		reloadActiveSession,
		persistActiveSession,
	};
}
