import { ChatConversation } from "@cortex/chat-core/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { appRpc } from "./rpc";
import { interviewTransport } from "./interview-transport";
import type { InterviewUIMessage } from "./types";

const INTERVIEW_CHAT_ID = "interview";

interface InterviewViewProps {
	onDone: () => void;
}

export function InterviewView({ onDone }: InterviewViewProps) {
	const [messages, setMessages] = useState<InterviewUIMessage[]>([]);
	const [loaded, setLoaded] = useState(false);
	const onDoneRef = useRef(onDone);
	onDoneRef.current = onDone;

	useEffect(() => {
		void appRpc.request
			.getConversation({ sessionId: INTERVIEW_CHAT_ID })
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

	const handlePersist = useCallback(
		async (next: InterviewUIMessage[]) => {
			setMessages(next);
			await appRpc.request.saveMessages({
				sessionId: INTERVIEW_CHAT_ID,
				messages: next,
			});
			const { exists } = await appRpc.request.hasPreferenceProfile();
			if (exists) {
				onDoneRef.current();
			}
		},
		[],
	);

	if (!loaded) {
		return (
			<div className="flex h-full items-center justify-center">
				<p className="text-sm text-muted-foreground">Loading...</p>
			</div>
		);
	}

	return (
		<ChatConversation
			chatId={INTERVIEW_CHAT_ID}
			transport={interviewTransport}
			messages={messages}
			onMessagesChange={handleMessagesChange}
			onPersistRequest={handlePersist}
			placeholder="Tell me about your ideal rental..."
			className="h-full"
		/>
	);
}
