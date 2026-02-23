import { useChat } from "@ai-sdk/react";
import { isTextUIPart } from "ai";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { chatRpc } from "./chat-rpc";
import { chatTransport } from "./chat-transport";
import { DEFAULT_SESSION_ID, type ChatUIMessage } from "./chat-types";

export default function App() {
	const [input, setInput] = useState("");
	const [loadError, setLoadError] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [showDiagnostics, setShowDiagnostics] = useState(true);
	const scrollRef = useRef<HTMLDivElement>(null);

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

	useEffect(() => {
		const el = scrollRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [messages]);

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const value = input.trim();
		if (value.length === 0) return;
		setInput("");
		void sendMessage({ text: value });
	};

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

	const isStreaming = status === "streaming" || status === "submitted";

	return (
		<div className="flex h-screen flex-col bg-white text-primary">
			{/* ── Toolbar ── */}
			<div className="flex h-[38px] shrink-0 items-center justify-between border-b border-separator px-3 select-none">
				<span className="text-[13px] font-medium text-secondary">
					Cortex Chat
				</span>
				<div className="flex items-center gap-0.5">
					<ToolbarButton
						onClick={() => void loadSession()}
						title="Reload saved"
					>
						<svg
							width="15"
							height="15"
							viewBox="0 0 15 15"
							fill="none"
						>
							<path
								d="M1.85 7.5a5.65 5.65 0 1 1 1.65 4"
								stroke="currentColor"
								strokeWidth="1.3"
								strokeLinecap="round"
							/>
							<path
								d="M1.5 4v3.5H5"
								stroke="currentColor"
								strokeWidth="1.3"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</ToolbarButton>

					<ToolbarButton
						onClick={() => void saveNow()}
						title="Save now"
					>
						<svg
							width="15"
							height="15"
							viewBox="0 0 15 15"
							fill="none"
						>
							<path
								d="M7.5 2.5v7M4.5 7l3 3 3-3"
								stroke="currentColor"
								strokeWidth="1.3"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
							<path
								d="M2.5 11v1.5h10V11"
								stroke="currentColor"
								strokeWidth="1.3"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</ToolbarButton>

					<div className="mx-1.5 h-3.5 w-px bg-separator" />

					<ToolbarButton
						onClick={() => setShowDiagnostics((s) => !s)}
						title="Toggle diagnostics"
						active={showDiagnostics}
					>
						<svg
							width="15"
							height="15"
							viewBox="0 0 15 15"
							fill="none"
						>
							<circle
								cx="7.5"
								cy="7.5"
								r="5.75"
								stroke="currentColor"
								strokeWidth="1.3"
							/>
							<path
								d="M7.5 6.5v4"
								stroke="currentColor"
								strokeWidth="1.3"
								strokeLinecap="round"
							/>
							<circle
								cx="7.5"
								cy="4.75"
								r="0.75"
								fill="currentColor"
							/>
						</svg>
					</ToolbarButton>
				</div>
			</div>

			{/* ── Error toasts ── */}
			{(error || loadError || saveError) && (
				<div className="absolute top-[46px] right-3 z-50 flex flex-col gap-1.5">
					{error && (
						<ErrorToast
							title="Chat Error"
							message={error.message}
							onDismiss={clearError}
							variant="error"
						/>
					)}
					{loadError && (
						<ErrorToast
							title="Load Error"
							message={loadError}
							onDismiss={() => setLoadError(null)}
							variant="warning"
						/>
					)}
					{saveError && (
						<ErrorToast
							title="Save Error"
							message={saveError}
							onDismiss={() => setSaveError(null)}
							variant="warning"
						/>
					)}
				</div>
			)}

			{/* ── Body ── */}
			<div className="flex flex-1 overflow-hidden">
				{/* Chat column */}
				<div className="flex flex-1 flex-col overflow-hidden">
					{/* Messages */}
					<div
						ref={scrollRef}
						className="native-scroll flex-1 overflow-y-auto"
					>
						{messages.length === 0 ? (
							<EmptyState />
						) : (
							<div className="mx-auto max-w-[720px] px-5 py-5">
								{messages.map((message) => (
									<article
										key={message.id}
										data-role={message.role}
										className={`msg-appear ${
											message.role === "user"
												? "mt-5 flex justify-end"
												: "mt-5 first:mt-0"
										}`}
									>
										{message.role === "user" ? (
											<div className="max-w-[75%] rounded-2xl bg-black/[0.05] px-4 py-2.5 text-[15px] leading-relaxed text-primary">
												{message.parts.map(
													(part, index) => {
														if (
															isTextUIPart(part)
														) {
															return (
																<Streamdown
																	key={`${message.id}-text-${index}`}
																	isAnimating={
																		false
																	}
																>
																	{part.text}
																</Streamdown>
															);
														}
														return (
															<span
																key={`${message.id}-${part.type}-${index}`}
																className="inline-block rounded-md bg-black/5 px-1.5 py-0.5 text-[11px] text-secondary"
															>
																[{part.type}]
															</span>
														);
													},
												)}
											</div>
										) : (
											<div className="text-[15px] leading-relaxed text-primary">
												{message.parts.map(
													(part, index) => {
														if (
															isTextUIPart(part)
														) {
															return (
																<Streamdown
																	key={`${message.id}-text-${index}`}
																	isAnimating={
																		isStreaming
																	}
																>
																	{part.text}
																</Streamdown>
															);
														}
														return (
															<span
																key={`${message.id}-${part.type}-${index}`}
																className="inline-block rounded-md bg-black/5 px-1.5 py-0.5 text-[11px] text-secondary"
															>
																[{part.type}]
															</span>
														);
													},
												)}
											</div>
										)}
									</article>
								))}
							</div>
						)}
					</div>

					{/* Composer */}
					<div className="shrink-0 px-5 pb-4 pt-2">
						<form
							onSubmit={submit}
							className="mx-auto flex max-w-[720px] items-end gap-2 rounded-2xl border border-separator bg-white px-4 py-2.5 shadow-sm transition-shadow focus-within:border-secondary/30 focus-within:shadow-md"
						>
							<input
								value={input}
								onChange={(event) =>
									setInput(event.currentTarget.value)
								}
								placeholder="Message..."
								className="min-h-[24px] flex-1 bg-transparent text-[15px] text-primary outline-none placeholder:text-tertiary"
							/>
							{isStreaming ? (
								<button
									type="button"
									onClick={stop}
									className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full bg-primary text-white transition-transform active:scale-90"
									title="Stop generating"
								>
									<svg
										width="10"
										height="10"
										viewBox="0 0 10 10"
										fill="currentColor"
									>
										<rect
											x="2"
											y="2"
											width="6"
											height="6"
											rx="1"
										/>
									</svg>
								</button>
							) : (
								<button
									type="submit"
									disabled={!input.trim()}
									className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full bg-primary text-white transition-all active:scale-90 disabled:opacity-20"
									title="Send message"
								>
									<svg
										width="14"
										height="14"
										viewBox="0 0 14 14"
										fill="none"
									>
										<path
											d="M7 11V3M7 3L3.5 6.5M7 3l3.5 3.5"
											stroke="currentColor"
											strokeWidth="1.8"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
									</svg>
								</button>
							)}
						</form>
					</div>
				</div>

				{/* Diagnostics panel */}
				{showDiagnostics && (
					<aside className="panel-in w-[200px] shrink-0 overflow-y-auto border-l border-separator bg-surface p-3">
						<h3 className="text-[11px] font-semibold uppercase tracking-wider text-tertiary">
							Diagnostics
						</h3>
						<dl className="mt-2.5 space-y-1.5 text-[12px]">
							<div className="flex justify-between">
								<dt className="text-secondary">Messages</dt>
								<dd className="font-medium tabular-nums">
									{messages.length}
								</dd>
							</div>
							<div className="flex justify-between">
								<dt className="text-secondary">Status</dt>
								<dd className="font-medium">
									<span
										className={`inline-flex items-center gap-1 ${
											isStreaming ? "text-accent" : ""
										}`}
									>
										{isStreaming && (
											<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
										)}
										{status}
									</span>
								</dd>
							</div>
							<div className="flex justify-between">
								<dt className="text-secondary">Session</dt>
								<dd className="font-mono text-[11px]">
									{DEFAULT_SESSION_ID}
								</dd>
							</div>
						</dl>
					</aside>
				)}
			</div>
		</div>
	);
}

/* ── Sub-components ── */

function ToolbarButton({
	children,
	onClick,
	title,
	active,
}: {
	children: React.ReactNode;
	onClick: () => void;
	title: string;
	active?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			title={title}
			className={`flex h-[26px] w-[26px] items-center justify-center rounded-md text-secondary transition-colors hover:bg-black/5 hover:text-primary active:bg-black/10 ${
				active ? "bg-black/5 text-primary" : ""
			}`}
		>
			{children}
		</button>
	);
}

function EmptyState() {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 px-6">
			<div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/[0.04]">
				<svg
					width="26"
					height="26"
					viewBox="0 0 24 24"
					fill="none"
					className="text-tertiary"
				>
					<path
						d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</div>
			<div className="text-center">
				<p className="text-[15px] font-medium text-primary">
					New Conversation
				</p>
				<p className="mt-0.5 text-[13px] text-tertiary">
					Send a message to get started
				</p>
			</div>
		</div>
	);
}

function ErrorToast({
	title,
	message,
	variant,
	onDismiss,
}: {
	title: string;
	message: string;
	variant: "error" | "warning";
	onDismiss?: () => void;
}) {
	const colors =
		variant === "error"
			? "border-danger/20 bg-danger/5 text-danger"
			: "border-warning/20 bg-warning/5 text-warning";

	return (
		<div
			className={`toast-in max-w-[280px] rounded-lg border px-3 py-2 text-[12px] shadow-sm ${colors}`}
		>
			<div className="flex items-start justify-between gap-2">
				<div>
					<p className="font-medium">{title}</p>
					<p className="mt-0.5 opacity-80">{message}</p>
				</div>
				{onDismiss && (
					<button
						type="button"
						onClick={onDismiss}
						className="mt-0.5 shrink-0 opacity-50 transition-opacity hover:opacity-100"
					>
						<svg
							width="10"
							height="10"
							viewBox="0 0 10 10"
							fill="none"
						>
							<path
								d="M2 2l6 6M8 2l-6 6"
								stroke="currentColor"
								strokeWidth="1.3"
								strokeLinecap="round"
							/>
						</svg>
					</button>
				)}
			</div>
		</div>
	);
}
