import {
	ChatConversation,
	useChatSessions,
} from "@cortex/chat-core/react";
import { useEffect, useState } from "react";
import { SessionRail } from "@/components/SessionRail";
import { Toolbar } from "@/components/Toolbar";
import { chatSessionStore } from "./chat-session-store";
import { chatTransport } from "./chat-transport";
import type { ChatUIMessage } from "./chat-types";

export default function App() {
	const [isLoadErrorDismissed, setIsLoadErrorDismissed] = useState(false);
	const {
		sessions,
		activeSessionId,
		messagesForActiveSession,
		isSwitchingSession,
		loadError,
		setMessagesForActiveSession,
		createNewSession,
		selectSession,
		reloadActiveSession,
		persistActiveSession,
	} = useChatSessions<ChatUIMessage>({
		store: chatSessionStore,
	});

	useEffect(() => {
		setIsLoadErrorDismissed(false);
	}, [loadError]);

	return (
		<div className="flex h-screen flex-col bg-background text-foreground">
			<Toolbar onReload={() => void reloadActiveSession()} />

			{loadError && !isLoadErrorDismissed && (
				<div className="shrink-0 border-b border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
					<div className="flex items-center justify-between gap-3">
						<span>{loadError}</span>
						<button
							type="button"
							onClick={() => setIsLoadErrorDismissed(true)}
							className="rounded border border-warning/30 px-1.5 py-0.5 text-[11px] hover:bg-warning/10"
						>
							Dismiss
						</button>
					</div>
				</div>
			)}

			<div className="flex flex-1 overflow-hidden">
				<SessionRail
					sessions={sessions}
					activeSessionId={activeSessionId}
					onNewSession={() => void createNewSession()}
					onSelectSession={(sessionId) => void selectSession(sessionId)}
					disabled={isSwitchingSession}
				/>

				<div className="flex flex-1 flex-col overflow-hidden">
					<ChatConversation
						chatId={activeSessionId}
						transport={chatTransport}
						messages={messagesForActiveSession}
						onMessagesChange={setMessagesForActiveSession}
						onPersistRequest={async (nextMessages) => {
							setMessagesForActiveSession(nextMessages);
							await persistActiveSession();
						}}
						className="flex-1"
					/>
				</div>
			</div>
		</div>
	);
}
