import { useChat } from "@ai-sdk/react";
import { isTextUIPart } from "ai";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { chatRpc } from "./chat-rpc";
import { chatTransport } from "./chat-transport";
import { DEFAULT_SESSION_ID, type ChatUIMessage } from "./chat-types";

function messageText(message: ChatUIMessage): string {
	const text = message.parts
		.filter((part) => isTextUIPart(part))
		.map((part) => part.text)
		.join("\n")
		.trim();

	if (text.length > 0) {
		return text;
	}

	return "[non-text content]";
}

export default function App() {
	const [input, setInput] = useState("");
	const [loadError, setLoadError] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);

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

	const conversationPreview = useMemo(
		() =>
			messages.map((message) => ({
				id: message.id,
				role: message.role,
				text: messageText(message),
			})),
		[messages],
	);

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const value = input.trim();
		if (value.length === 0) {
			return;
		}

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

	return (
		<div className="min-h-screen bg-slate-100 text-slate-900">
			<div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-8">
				<header className="mb-6 rounded-xl bg-white p-5 shadow-sm">
					<h1 className="text-2xl font-semibold">Chat Kitchen Sink</h1>
					<p className="mt-1 text-sm text-slate-600">
						Phase 2 transport validation through Electrobun RPC and AI SDK
						streaming.
					</p>
					<div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
						<span className="rounded bg-slate-100 px-2 py-1 font-mono">
							session: {DEFAULT_SESSION_ID}
						</span>
						<span className="rounded bg-slate-100 px-2 py-1">status: {status}</span>
					</div>
				</header>

				<main className="grid flex-1 gap-4 md:grid-cols-[2fr_1fr]">
					<section className="flex min-h-[420px] flex-col rounded-xl bg-white p-4 shadow-sm">
						<div className="mb-3 flex items-center justify-between">
							<h2 className="text-sm font-medium uppercase tracking-wide text-slate-600">
								Conversation
							</h2>
							<div className="flex gap-2">
								<button
									type="button"
									onClick={() => void loadSession()}
									className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
								>
									Reload Saved
								</button>
								<button
									type="button"
									onClick={() => void saveNow()}
									className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
								>
									Save Now
								</button>
							</div>
						</div>

						<div className="flex-1 space-y-3 overflow-y-auto rounded-lg bg-slate-50 p-3">
							{conversationPreview.length === 0 ? (
								<p className="text-sm text-slate-500">No messages yet.</p>
							) : (
								conversationPreview.map((message) => (
									<article
										key={message.id}
										className={
											message.role === "user"
												? "ml-10 rounded-lg bg-sky-100 p-3"
												: "mr-10 rounded-lg bg-white p-3"
										}
									>
										<p className="mb-1 text-xs uppercase tracking-wide text-slate-500">
											{message.role}
										</p>
										<p className="whitespace-pre-wrap text-sm">{message.text}</p>
									</article>
								))
							)}
						</div>

						<form onSubmit={submit} className="mt-3 flex gap-2">
							<input
								value={input}
								onChange={(event) => setInput(event.currentTarget.value)}
								placeholder="Type a prompt"
								className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
							/>
							<button
								type="submit"
								disabled={status === "streaming" || status === "submitted"}
								className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
							>
								Send
							</button>
							<button
								type="button"
								onClick={stop}
								disabled={status !== "streaming" && status !== "submitted"}
								className="rounded border border-slate-300 px-4 py-2 text-sm disabled:opacity-50"
							>
								Stop
							</button>
						</form>
					</section>

					<aside className="rounded-xl bg-white p-4 shadow-sm">
						<h2 className="text-sm font-medium uppercase tracking-wide text-slate-600">
							Diagnostics
						</h2>
						<ul className="mt-3 space-y-2 text-sm">
							<li>
								<span className="font-medium">Messages:</span> {messages.length}
							</li>
							<li>
								<span className="font-medium">Status:</span> {status}
							</li>
						</ul>

						{error ? (
							<div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
								<p className="font-medium">Chat Error</p>
								<p className="mt-1">{error.message}</p>
								<button
									type="button"
									onClick={clearError}
									className="mt-2 rounded border border-red-200 px-2 py-1 text-xs"
								>
									Dismiss
								</button>
							</div>
						) : null}

						{loadError ? (
							<div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
								<p className="font-medium">Load Error</p>
								<p className="mt-1">{loadError}</p>
							</div>
						) : null}

						{saveError ? (
							<div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
								<p className="font-medium">Save Error</p>
								<p className="mt-1">{saveError}</p>
							</div>
						) : null}
					</aside>
				</main>
			</div>
		</div>
	);
}
