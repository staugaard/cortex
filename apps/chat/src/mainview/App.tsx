import { useChat } from "@ai-sdk/react";
import { useCallback, useEffect, useState } from "react";
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
	PromptInputTextarea,
	PromptInputFooter,
	PromptInputSubmit,
	type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { MessageSquareIcon } from "lucide-react";
import { Toolbar } from "@/components/Toolbar";
import { DiagnosticsPanel } from "@/components/DiagnosticsPanel";
import { ErrorToasts } from "@/components/ErrorToasts";
import { chatRpc } from "./chat-rpc";
import { chatTransport } from "./chat-transport";
import { DEFAULT_SESSION_ID, type ChatUIMessage } from "./chat-types";

export default function App() {
	const [loadError, setLoadError] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [showDiagnostics, setShowDiagnostics] = useState(true);

	const {
		messages,
		sendMessage,
		setMessages,
		status,
		error,
		clearError,
		stop,
	} = useChat<ChatUIMessage>({
		id: DEFAULT_SESSION_ID,
		transport: chatTransport,
		onFinish: ({ messages: finishedMessages }) => {
			void chatRpc.request
				.saveMessages({
					sessionId: DEFAULT_SESSION_ID,
					messages: finishedMessages,
					title: "Kitchen Sink Session",
				})
				.then(() => setSaveError(null))
				.catch((saveIssue: unknown) => {
					setSaveError(
						saveIssue instanceof Error
							? saveIssue.message
							: String(saveIssue),
					);
				});
		},
		onError: (issue) => {
			setSaveError(issue.message);
		},
	});

	const loadSession = useCallback(async () => {
		try {
			const result = await chatRpc.request.getConversation({
				sessionId: DEFAULT_SESSION_ID,
			});
			setLoadError(null);
			setMessages(result.conversation?.messages ?? []);
		} catch (issue) {
			setLoadError(issue instanceof Error ? issue.message : String(issue));
		}
	}, [setMessages]);

	useEffect(() => {
		void loadSession();
	}, [loadSession]);

	const saveNow = async () => {
		try {
			await chatRpc.request.saveMessages({
				sessionId: DEFAULT_SESSION_ID,
				messages,
				title: "Kitchen Sink Session",
			});
			setSaveError(null);
		} catch (issue) {
			setSaveError(issue instanceof Error ? issue.message : String(issue));
		}
	};

	const handleSubmit = (message: PromptInputMessage) => {
		if (!message.text.trim()) return;
		void sendMessage({ text: message.text });
	};

	return (
		<div className="flex h-screen flex-col bg-background text-foreground">
			<Toolbar
				onReload={() => void loadSession()}
				onSave={() => void saveNow()}
				showDiagnostics={showDiagnostics}
				onToggleDiagnostics={() => setShowDiagnostics((s) => !s)}
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
				<div className="flex flex-1 flex-col overflow-hidden">
					<Conversation>
						<ConversationContent>
							{messages.length === 0 ? (
								<ConversationEmptyState
									title="New Conversation"
									description="Send a message to get started"
									icon={
										<MessageSquareIcon className="size-8" />
									}
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
																	(status ===
																		"streaming" ||
																		status ===
																			"submitted") &&
																	message.role ===
																		"assistant"
																}
															>
																{part.text}
															</MessageResponse>
														);
													default:
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
								<PromptInputSubmit
									status={status}
									onStop={stop}
								/>
							</PromptInputFooter>
						</PromptInput>
					</div>
				</div>

				{showDiagnostics && (
					<DiagnosticsPanel
						messageCount={messages.length}
						status={status}
					/>
				)}
			</div>
		</div>
	);
}
