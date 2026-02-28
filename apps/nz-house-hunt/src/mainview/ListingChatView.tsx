import { ChatConversation } from "@cortex/chat-core/react";
import { useCallback, useEffect, useState } from "react";
import { appRpc } from "./rpc";
import { interviewTransport } from "./interview-transport";
import type { InterviewUIMessage } from "./types";

const LISTING_CHAT_ID = "listing-chat";

export function ListingChatView() {
	const [messages, setMessages] = useState<InterviewUIMessage[]>([]);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		void appRpc.request
			.getConversation({ sessionId: LISTING_CHAT_ID })
			.then((res) => {
				if (res.conversation) {
					setMessages(res.conversation.messages);
				}
				setLoaded(true);
			});
	}, []);

	const handleMessagesChange = useCallback((next: InterviewUIMessage[]) => {
		setMessages(next);
	}, []);

	const handlePersist = useCallback(async (next: InterviewUIMessage[]) => {
		setMessages(next);
		await appRpc.request.saveMessages({
			sessionId: LISTING_CHAT_ID,
			messages: next,
		});
	}, []);

	if (!loaded) {
		return (
			<div className="flex h-full items-center justify-center">
				<p className="text-sm text-muted-foreground">Loading...</p>
			</div>
		);
	}

	return (
		<ChatConversation
			chatId={LISTING_CHAT_ID}
			transport={interviewTransport}
			messages={messages}
			onMessagesChange={handleMessagesChange}
			onPersistRequest={handlePersist}
			placeholder="Ask about your listings..."
			className="h-full"
		/>
	);
}
