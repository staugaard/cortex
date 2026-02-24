import { useChat } from "@ai-sdk/react";
import {
	isDataUIPart,
	isReasoningUIPart,
	isTextUIPart,
	isToolOrDynamicToolUIPart,
	lastAssistantMessageIsCompleteWithApprovalResponses,
	type DynamicToolUIPart,
	type ToolUIPart,
} from "ai";
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
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { CodeBlock } from "@/components/ai-elements/code-block";
import {
	Snippet,
	SnippetCopyButton,
	SnippetInput,
} from "@/components/ai-elements/snippet";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
	Confirmation,
	ConfirmationAccepted,
	ConfirmationAction,
	ConfirmationActions,
	ConfirmationRejected,
	ConfirmationRequest,
	ConfirmationTitle,
} from "@/components/ai-elements/confirmation";
import {
	Tool,
	ToolContent,
	ToolHeader,
	ToolInput,
	ToolOutput,
} from "@/components/ai-elements/tool";
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
	type ChatUITools,
	type ChatUIMessage,
} from "./chat-types";

type ChatMessagePart = ChatUIMessage["parts"][number];
type ToolPart = DynamicToolUIPart | ToolUIPart<ChatUITools>;

function toolErrorTextFromPart(part: ToolPart): string | undefined {
	return "errorText" in part ? part.errorText : undefined;
}

function toolOutputFromPart(part: ToolPart): unknown {
	return "output" in part ? part.output : undefined;
}

function toolApprovalIdFromPart(part: ToolPart): string | undefined {
	return part.approval?.id;
}

function toToolPart(part: ChatMessagePart): ToolPart | null {
	if (!isToolOrDynamicToolUIPart(part)) {
		return null;
	}
	return part as ToolPart;
}

function ElementsToolPart({
	part,
	disableActions,
	onApprove,
	onDeny,
}: {
	part: ToolPart;
	disableActions: boolean;
	onApprove: (approvalId: string) => void;
	onDeny: (approvalId: string) => void;
}) {
	const toolCallId = part.toolCallId;
	const toolState = part.state;
	const toolErrorText = toolErrorTextFromPart(part);
	const toolOutput = toolOutputFromPart(part);
	const approvalId = toolApprovalIdFromPart(part);
	const hasApproval = part.approval != null;
	const canRespondToApproval =
		part.state === "approval-requested" && typeof approvalId === "string";

	return (
		<Tool defaultOpen={toolState !== "output-available"}>
			{part.type === "dynamic-tool" ? (
				<ToolHeader
					type={part.type}
					state={toolState}
					toolName={part.toolName}
				/>
			) : (
				<ToolHeader type={part.type} state={toolState} />
			)}
			<ToolContent>
				{toolCallId ? (
					<Snippet code={toolCallId}>
						<SnippetInput aria-label="Tool call ID" />
						<SnippetCopyButton />
					</Snippet>
				) : null}
				{part.state === "input-streaming" ? (
					<Shimmer>Streaming tool input...</Shimmer>
				) : null}
				{part.input != null ? <ToolInput input={part.input} /> : null}
				<ToolOutput output={toolOutput} errorText={toolErrorText} />
				{hasApproval ? (
					<Confirmation approval={part.approval} state={part.state}>
						<ConfirmationTitle>Approval Required</ConfirmationTitle>
						<ConfirmationRequest>
							This tool call requires explicit approval before execution.
						</ConfirmationRequest>
						<ConfirmationAccepted>Approved.</ConfirmationAccepted>
						<ConfirmationRejected>Denied.</ConfirmationRejected>
						<ConfirmationActions>
							<ConfirmationAction
								onClick={() => {
									if (approvalId) {
										onApprove(approvalId);
									}
								}}
								disabled={disableActions || !canRespondToApproval}
								data-testid="tool-approve-button"
							>
								Approve
							</ConfirmationAction>
							<ConfirmationAction
								variant="outline"
								onClick={() => {
									if (approvalId) {
										onDeny(approvalId);
									}
								}}
								disabled={disableActions || !canRespondToApproval}
								data-testid="tool-deny-button"
							>
								Deny
							</ConfirmationAction>
						</ConfirmationActions>
					</Confirmation>
				) : null}
			</ToolContent>
		</Tool>
	);
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
		addToolApprovalResponse,
	} = useChat<ChatUIMessage>({
		id: activeSessionId,
		transport: chatTransport,
		sendAutomaticallyWhen: ({ messages: currentMessages }) =>
			lastAssistantMessageIsCompleteWithApprovalResponses({
				messages: currentMessages,
			}),
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

	const handleToolApproval = useCallback(
		(approvalId: string, approved: boolean) => {
			void Promise.resolve(
				addToolApprovalResponse({
					id: approvalId,
					approved,
					reason: approved ? undefined : "Denied in chat UI",
				}),
			).catch((issue) => {
				setSaveError(asErrorMessage(issue));
			});
		},
		[addToolApprovalResponse],
	);

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

	const disableToolActions =
		status === "streaming" || status === "submitted";

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
												if (isTextUIPart(part)) {
													return (
														<MessageResponse
															key={`${message.id}-${i}`}
															isAnimating={
																(status === "streaming" ||
																	status === "submitted") &&
																message.role === "assistant"
															}
														>
															{part.text}
														</MessageResponse>
													);
												}

											if (isReasoningUIPart(part)) {
												return (
													<Reasoning
														key={`${message.id}-${i}-reasoning`}
														isStreaming={part.state === "streaming"}
													>
														<ReasoningTrigger />
														<ReasoningContent>{part.text}</ReasoningContent>
													</Reasoning>
												);
											}

												if (
													isDataUIPart(part) &&
													part.type === "data-agentActivity"
												) {
													return (
														<AgentActivityItem
															key={`${message.id}-${part.type}-${part.data.activityId}`}
															activity={part.data}
														/>
													);
												}

												const toolPart = toToolPart(part);
												if (toolPart) {
													return (
														<ElementsToolPart
															key={`${message.id}-${part.type}-${i}`}
															part={toolPart}
															disableActions={disableToolActions}
															onApprove={(approvalId) =>
																handleToolApproval(approvalId, true)
															}
															onDeny={(approvalId) =>
																handleToolApproval(approvalId, false)
															}
														/>
													);
												}

												return (
													<div
														key={`${message.id}-${part.type}-${i}`}
														className="max-w-full"
													>
														<CodeBlock
															code={`Unsupported UI part: ${part.type}`}
															language="json"
														/>
													</div>
												);
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
