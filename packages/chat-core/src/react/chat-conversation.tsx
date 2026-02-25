import { useChat } from "@ai-sdk/react";
import { lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from "ai";
import { MessageSquareIcon } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationScrollButton,
} from "./components/ai-elements/conversation";
import { Message, MessageContent } from "./components/ai-elements/message";
import {
	PromptInput,
	PromptInputFooter,
	type PromptInputMessage,
	PromptInputSubmit,
	PromptInputTextarea,
} from "./components/ai-elements/prompt-input";
import { cn } from "./lib/utils";
import { renderMessagePart } from "./part-renderers";
import type { ChatConversationProps } from "./types";

function asErrorMessage(issue: unknown): string {
	return issue instanceof Error ? issue.message : String(issue);
}

function messagesSyncKey(messages: UIMessage[]): string {
	try {
		return JSON.stringify(messages);
	} catch {
		return String(messages.length);
	}
}

export function ChatConversation<UI_MESSAGE extends UIMessage>({
	chatId,
	transport,
	messages,
	onMessagesChange,
	onPersistRequest,
	placeholder = "Message...",
	className,
	renderDataPart,
	renderToolPart,
	renderUnsupportedPart,
	renderComposer,
	onToolApproval,
}: ChatConversationProps<UI_MESSAGE>) {
	const [persistError, setPersistError] = useState<string | null>(null);
	const externalSyncKeyRef = useRef<string>(messagesSyncKey(messages));

	const {
		messages: chatMessages,
		sendMessage,
		setMessages,
		status,
		error,
		clearError,
		stop,
		addToolApprovalResponse,
	} = useChat<UI_MESSAGE>({
		id: chatId,
		transport,
		sendAutomaticallyWhen: ({ messages: currentMessages }) =>
			lastAssistantMessageIsCompleteWithApprovalResponses({
				messages: currentMessages,
			}),
		onFinish: ({ messages: finishedMessages }) => {
			if (!onPersistRequest) {
				return;
			}
			void onPersistRequest(finishedMessages).catch((issue: unknown) => {
				setPersistError(asErrorMessage(issue));
			});
		},
		onError: (issue) => {
			setPersistError(issue.message);
		},
	});

	useEffect(() => {
		const externalKey = messagesSyncKey(messages);
		if (externalKey === externalSyncKeyRef.current) {
			return;
		}
		externalSyncKeyRef.current = externalKey;
		setMessages(messages);
	}, [messages, setMessages]);

	useEffect(() => {
		const internalKey = messagesSyncKey(chatMessages);
		if (internalKey === externalSyncKeyRef.current) {
			return;
		}
		externalSyncKeyRef.current = internalKey;
		onMessagesChange(chatMessages);
	}, [chatMessages, onMessagesChange]);

	useEffect(() => {
		externalSyncKeyRef.current = messagesSyncKey(messages);
		setMessages(messages);
	}, [chatId, messages, setMessages]);

	const handleToolApproval = useCallback(
		(approvalId: string, approved: boolean) => {
			const reason = approved ? undefined : "Denied in chat UI";
			const handleDefault = async () => {
				await addToolApprovalResponse({
					id: approvalId,
					approved,
					reason,
				});
			};

			void Promise.resolve(
				onToolApproval
					? onToolApproval({ approvalId, approved, reason })
					: handleDefault(),
			).catch((issue: unknown) => {
				setPersistError(asErrorMessage(issue));
			});
		},
		[addToolApprovalResponse, onToolApproval],
	);

	const handleSubmit = useCallback(
		(message: PromptInputMessage) => {
			if (!message.text.trim()) {
				return;
			}
			void sendMessage({ text: message.text });
		},
		[sendMessage],
	);

	const disableToolActions =
		status === "streaming" || status === "submitted";
	const composer =
		renderComposer?.({
			status,
			placeholder,
			onSubmit: (text) => handleSubmit({ text, files: [] }),
			onStop: stop,
		}) ?? (
			<PromptInput onSubmit={handleSubmit} className="mx-auto max-w-[720px]">
				<PromptInputTextarea placeholder={placeholder} />
				<PromptInputFooter>
					<span />
					<PromptInputSubmit status={status} onStop={stop} />
				</PromptInputFooter>
			</PromptInput>
		);

	return (
		<div className={cn("flex h-full min-h-0 flex-col", className)}>
			{(error || persistError) && (
				<div className="shrink-0 border-b border-border bg-destructive/10 px-4 py-2 text-xs text-destructive">
					<div className="flex items-center justify-between gap-3">
						<span>{error?.message ?? persistError}</span>
						<button
							type="button"
							onClick={() => {
								clearError();
								setPersistError(null);
							}}
							className="rounded border border-destructive/30 px-1.5 py-0.5 text-[11px] hover:bg-destructive/10"
						>
							Dismiss
						</button>
					</div>
				</div>
			)}
			<Conversation className="min-h-0">
				<ConversationContent>
					{chatMessages.length === 0 ? (
						<ConversationEmptyState
							title="New Conversation"
							description="Send a message to get started"
							icon={<MessageSquareIcon className="size-8" />}
						/>
					) : (
						chatMessages.map((message, messageIndex) => (
							<Message
								from={message.role}
								key={message.id}
								data-role={message.role}
								data-testid="chat-message"
							>
								<MessageContent>
									{message.parts.map((part, partIndex) => (
										<Fragment key={`${message.id}-${partIndex}`}>
											{renderMessagePart({
												part,
												message,
												messageIndex,
												partIndex,
												status,
												renderDataPart,
												renderToolPart,
												renderUnsupportedPart,
												disableToolActions,
												onApproveToolCall: (approvalId) =>
													handleToolApproval(approvalId, true),
												onDenyToolCall: (approvalId) =>
													handleToolApproval(approvalId, false),
											})}
										</Fragment>
									))}
								</MessageContent>
							</Message>
						))
					)}
				</ConversationContent>
				<ConversationScrollButton />
			</Conversation>
			<div className="shrink-0 px-5 pb-4 pt-2">{composer}</div>
		</div>
	);
}
