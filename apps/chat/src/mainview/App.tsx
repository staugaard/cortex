import { useChat } from "@ai-sdk/react";
import type { ConversationSummary } from "@cortex/chat-core/rpc";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
	Message,
	MessageContent,
	MessageResponse,
} from "@/components/ai-elements/message";
import {
	PromptInput,
	PromptInputFooter,
	type PromptInputMessage,
	PromptInputSubmit,
	PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { AgentActivityItem } from "@/components/AgentActivityItem";
import { MessageSquareIcon } from "lucide-react";
import { DiagnosticsPanel } from "@/components/DiagnosticsPanel";
import { ErrorToasts } from "@/components/ErrorToasts";
import { SessionRail } from "@/components/SessionRail";
import { Toolbar } from "@/components/Toolbar";
import { chatRpc } from "./chat-rpc";
import { chatTransport } from "./chat-transport";
import {
	createTemporarySessionId,
	TEMP_SESSION_PREFIX,
	type ChatUIMessage,
} from "./chat-types";

type ChatMessagePart = ChatUIMessage["parts"][number];

function isToolPart(part: ChatMessagePart): boolean {
	return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function toolNameFromPart(part: ChatMessagePart): string {
	if (part.type === "dynamic-tool") {
		return part.toolName;
	}
	if (part.type.startsWith("tool-")) {
		return part.type.slice("tool-".length);
	}
	return "tool";
}

function formatPartPayload(payload: unknown): string {
	if (payload == null) {
		return "";
	}
	if (typeof payload === "string") {
		return payload;
	}
	try {
		return JSON.stringify(payload, null, 2);
	} catch {
		return String(payload);
	}
}

function asErrorMessage(issue: unknown): string {
	return issue instanceof Error ? issue.message : String(issue);
}

function sortSessionsByCreatedAt(
	sessions: ConversationSummary[],
): ConversationSummary[] {
	return [...sessions].sort((a, b) => b.createdAt - a.createdAt);
}

function upsertSession(
	sessions: ConversationSummary[],
	next: ConversationSummary,
): ConversationSummary[] {
	const withoutExisting = sessions.filter(
		(session) => session.sessionId !== next.sessionId,
	);
	return sortSessionsByCreatedAt([...withoutExisting, next]);
}

function replaceSessionId(
	sessions: ConversationSummary[],
	fromSessionId: string,
	toSessionId: string,
): ConversationSummary[] {
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

function provisionalSession(sessionId: string): ConversationSummary {
	const now = Date.now();
	return {
		sessionId,
		title: "New Conversation",
		createdAt: now,
		updatedAt: now,
	};
}

export default function App() {
	const [loadError, setLoadError] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [showDiagnostics, setShowDiagnostics] = useState(true);
	const [sessions, setSessions] = useState<ConversationSummary[]>([]);
	const [activeSessionId, setActiveSessionId] = useState<string>(() =>
		createTemporarySessionId(),
	);
	const [isSwitchingSession, setIsSwitchingSession] = useState(false);

	const activeSessionIdRef = useRef(activeSessionId);
	const messagesRef = useRef<ChatUIMessage[]>([]);
	const pendingRemapHydrationRef = useRef<{
		sessionId: string;
		messages: ChatUIMessage[];
	} | null>(null);

	useEffect(() => {
		activeSessionIdRef.current = activeSessionId;
	}, [activeSessionId]);

	useEffect(() => {
		const handleConversationUpdated = (conversation: ConversationSummary) => {
			setSessions((previousSessions) =>
				upsertSession(previousSessions, conversation),
			);
		};

		chatRpc.addMessageListener("conversationUpdated", handleConversationUpdated);
		return () => {
			chatRpc.removeMessageListener(
				"conversationUpdated",
				handleConversationUpdated,
			);
		};
	}, []);

	const persistSession = useCallback(
		async (
			sessionId: string,
			nextMessages: ChatUIMessage[],
			options?: { preserveViewOnRemap?: boolean },
		): Promise<string> => {
			if (
				nextMessages.length === 0 &&
				sessionId.startsWith(TEMP_SESSION_PREFIX)
			) {
				return sessionId;
			}

			const saveResult = await chatRpc.request.saveMessages({
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

			if (
				canonicalSessionId !== sessionId &&
				activeSessionIdRef.current === sessionId
			) {
				if (options?.preserveViewOnRemap) {
					pendingRemapHydrationRef.current = {
						sessionId: canonicalSessionId,
						messages: nextMessages,
					};
					activeSessionIdRef.current = canonicalSessionId;
					setActiveSessionId(canonicalSessionId);
				}
			}

			const savedConversationResult = await chatRpc.request.getConversation({
				sessionId: canonicalSessionId,
			});
			const savedConversation = savedConversationResult.conversation;
			if (savedConversation) {
				setSessions((previousSessions) =>
					upsertSession(previousSessions, {
						sessionId: savedConversation.sessionId,
						title: savedConversation.title,
						createdAt: savedConversation.createdAt,
						updatedAt: savedConversation.updatedAt,
					}),
				);
			}

			return canonicalSessionId;
		},
		[],
	);

	const {
		messages,
		sendMessage,
		setMessages,
		status,
		error,
		clearError,
		stop,
	} = useChat<ChatUIMessage>({
		id: activeSessionId,
		transport: chatTransport,
		onFinish: ({ messages: finishedMessages }) => {
			const sessionIdAtFinish = activeSessionIdRef.current;
			void persistSession(sessionIdAtFinish, finishedMessages, {
				preserveViewOnRemap: true,
			}).catch((saveIssue: unknown) => {
				setSaveError(asErrorMessage(saveIssue));
			});
		},
		onError: (issue) => {
			setSaveError(issue.message);
		},
	});

	useEffect(() => {
		messagesRef.current = messages;
	}, [messages]);

	useEffect(() => {
		const pendingHydration = pendingRemapHydrationRef.current;
		if (!pendingHydration || pendingHydration.sessionId !== activeSessionId) {
			return;
		}

		setMessages(pendingHydration.messages);
		messagesRef.current = pendingHydration.messages;
		pendingRemapHydrationRef.current = null;
	}, [activeSessionId, setMessages]);

	const loadSessionMessages = useCallback(
		async (sessionId: string): Promise<ChatUIMessage[]> => {
			if (sessionId.startsWith(TEMP_SESSION_PREFIX)) {
				return [];
			}

			const result = await chatRpc.request.getConversation({ sessionId });
			const conversation = result.conversation;
			if (conversation) {
				setSessions((previousSessions) =>
					upsertSession(previousSessions, {
						sessionId: conversation.sessionId,
						title: conversation.title,
						createdAt: conversation.createdAt,
						updatedAt: conversation.updatedAt,
					}),
				);
			}
			return conversation?.messages ?? [];
		},
		[],
	);

	const loadSessionList = useCallback(async () => {
		const result = await chatRpc.request.getConversationList({});
		return sortSessionsByCreatedAt(result.conversations);
	}, []);

	useEffect(() => {
		let isCancelled = false;

		void (async () => {
			try {
				const availableSessions = await loadSessionList();
				if (isCancelled) {
					return;
				}

				setLoadError(null);
				if (availableSessions.length === 0) {
					const tempSessionId = createTemporarySessionId();
					activeSessionIdRef.current = tempSessionId;
					setActiveSessionId(tempSessionId);
					setSessions([provisionalSession(tempSessionId)]);
					setMessages([]);
					return;
				}

				const firstSessionId = availableSessions[0]!.sessionId;
				activeSessionIdRef.current = firstSessionId;
				setActiveSessionId(firstSessionId);
				setSessions(availableSessions);
				setMessages(await loadSessionMessages(firstSessionId));
			} catch (issue) {
				if (!isCancelled) {
					setLoadError(asErrorMessage(issue));
				}
			}
		})();

		return () => {
			isCancelled = true;
		};
	}, [loadSessionList, loadSessionMessages, setMessages]);

	const reloadActiveSession = useCallback(async () => {
		try {
			setMessages(await loadSessionMessages(activeSessionIdRef.current));
			setLoadError(null);
		} catch (issue) {
			setLoadError(asErrorMessage(issue));
		}
	}, [loadSessionMessages, setMessages]);

	const selectSession = useCallback(
		async (nextSessionId: string) => {
			if (nextSessionId === activeSessionIdRef.current) {
				return;
			}

			setIsSwitchingSession(true);
			try {
				stop();
				const currentSessionId = activeSessionIdRef.current;
				const canonicalCurrentSessionId = await persistSession(
					currentSessionId,
					messagesRef.current,
				);

				const resolvedNextSessionId =
					nextSessionId === currentSessionId
						? canonicalCurrentSessionId
						: nextSessionId;

				activeSessionIdRef.current = resolvedNextSessionId;
				setActiveSessionId(resolvedNextSessionId);
				setMessages(await loadSessionMessages(resolvedNextSessionId));
				setLoadError(null);
			} catch (issue) {
				setLoadError(asErrorMessage(issue));
			} finally {
				setIsSwitchingSession(false);
			}
		},
		[loadSessionMessages, persistSession, setMessages, stop],
	);

	const createNewSession = useCallback(async () => {
		setIsSwitchingSession(true);
		try {
			stop();
			await persistSession(activeSessionIdRef.current, messagesRef.current);
			const newSessionId = createTemporarySessionId();
			activeSessionIdRef.current = newSessionId;
			setActiveSessionId(newSessionId);
			setSessions((previousSessions) =>
				upsertSession(previousSessions, provisionalSession(newSessionId)),
			);
			setMessages([]);
			setLoadError(null);
		} catch (issue) {
			setLoadError(asErrorMessage(issue));
		} finally {
			setIsSwitchingSession(false);
		}
	}, [persistSession, setMessages, stop]);

	const handleSubmit = (message: PromptInputMessage) => {
		if (!message.text.trim()) {
			return;
		}
		void sendMessage({ text: message.text });
	};

	return (
		<div className="flex h-screen flex-col bg-background text-foreground">
			<Toolbar
				onReload={() => void reloadActiveSession()}
				showDiagnostics={showDiagnostics}
				onToggleDiagnostics={() => setShowDiagnostics((state) => !state)}
			/>

			<ErrorToasts
				error={error}
				loadError={loadError}
				saveError={saveError}
				onDismissError={clearError}
				onDismissLoadError={() => setLoadError(null)}
				onDismissSaveError={() => setSaveError(null)}
			/>

			<div className="flex flex-1 overflow-hidden">
				<SessionRail
					sessions={sessions}
					activeSessionId={activeSessionId}
					onNewSession={() => void createNewSession()}
					onSelectSession={(sessionId) => void selectSession(sessionId)}
					disabled={isSwitchingSession}
				/>

				<div className="flex flex-1 flex-col overflow-hidden">
					<Conversation>
						<ConversationContent>
							{messages.length === 0 ? (
								<ConversationEmptyState
									title="New Conversation"
									description="Send a message to get started"
									icon={<MessageSquareIcon className="size-8" />}
								/>
							) : (
								messages.map((message) => (
									<Message
										from={message.role}
										key={message.id}
										data-role={message.role}
										data-testid="chat-message"
									>
										<MessageContent>
											{message.parts.map((part, i) => {
												switch (part.type) {
													case "text":
														return (
															<MessageResponse
																key={`${message.id}-${i}`}
																isAnimating={
																	(status === "streaming" ||
																		status === "submitted") &&
																	message.role ===
																		"assistant"
																}
															>
																{part.text}
															</MessageResponse>
														);
													case "reasoning":
														return (
															<div
																key={`${message.id}-${i}-reasoning`}
																className="rounded-md border border-border/70 bg-black/5 px-3 py-2 text-xs text-muted-foreground"
															>
																<div className="mb-1 font-medium uppercase tracking-wide">
																	Reasoning
																</div>
																{part.text}
															</div>
														);
													case "data-agentActivity":
														return (
															<AgentActivityItem
																key={`${message.id}-${part.type}-${part.data.activityId}`}
																activity={part.data}
															/>
														);
												default:
													if (isToolPart(part)) {
														const dynamicPart = part as {
															state?: string;
															input?: unknown;
															output?: unknown;
																errorText?: string;
																toolCallId?: string;
															};
															return (
																<div
																	key={`${message.id}-${part.type}-${i}`}
																	className="rounded-md border border-border/70 bg-black/5 px-3 py-2 text-xs"
																>
																	<div className="font-medium">
																		Tool: {toolNameFromPart(part)} ·{" "}
																		{dynamicPart.state ?? "unknown"}
																	</div>
																	{dynamicPart.toolCallId ? (
																		<div className="text-[11px] text-muted-foreground">
																			Call: {dynamicPart.toolCallId}
																		</div>
																	) : null}
																	{dynamicPart.errorText ? (
																		<pre className="mt-1 overflow-x-auto rounded-sm bg-red-50 px-2 py-1 text-[11px] text-red-700">
																			{dynamicPart.errorText}
																		</pre>
																	) : null}
																	{dynamicPart.input != null ? (
																		<pre className="mt-1 overflow-x-auto rounded-sm bg-black/10 px-2 py-1 text-[11px]">
																			input: {formatPartPayload(dynamicPart.input)}
																		</pre>
																	) : null}
																	{dynamicPart.output != null ? (
																		<pre className="mt-1 overflow-x-auto rounded-sm bg-black/10 px-2 py-1 text-[11px]">
																			output: {formatPartPayload(dynamicPart.output)}
																		</pre>
																	) : null}
																</div>
															);
														}
														return (
															<span
																key={`${message.id}-${part.type}-${i}`}
																className="inline-block rounded-md bg-black/5 px-1.5 py-0.5 text-[11px] text-muted-foreground"
															>
																[{part.type}]
															</span>
														);
												}
											})}
										</MessageContent>
									</Message>
								))
							)}
						</ConversationContent>
						<ConversationScrollButton />
					</Conversation>

					<div className="shrink-0 px-5 pb-4 pt-2">
						<PromptInput
							onSubmit={handleSubmit}
							className="mx-auto max-w-[720px]"
						>
							<PromptInputTextarea placeholder="Message..." />
							<PromptInputFooter>
								<span />
								<PromptInputSubmit status={status} onStop={stop} />
							</PromptInputFooter>
						</PromptInput>
					</div>
				</div>

				{showDiagnostics && (
					<DiagnosticsPanel
						messageCount={messages.length}
						status={status}
						sessionId={activeSessionId}
					/>
				)}
			</div>
		</div>
	);
}
