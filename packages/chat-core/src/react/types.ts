import type {
	ChatStatus,
	ChatTransport,
	DynamicToolUIPart,
	ToolUIPart,
	UIMessage,
} from "ai";
import type { ReactNode } from "react";

export interface ChatSessionSummary {
	sessionId: string;
	title?: string;
	createdAt: number;
	updatedAt: number;
}

export interface ChatSessionRecord<UI_MESSAGE> extends ChatSessionSummary {
	messages: UI_MESSAGE[];
}

export interface ChatSessionStore<UI_MESSAGE> {
	listSessions(input?: { limit?: number }): Promise<{
		sessions: ChatSessionSummary[];
	}>;
	getSession(input: { sessionId: string }): Promise<{
		session: ChatSessionRecord<UI_MESSAGE> | null;
	}>;
	saveSession(input: {
		sessionId: string;
		messages: UI_MESSAGE[];
	}): Promise<{
		sessionId: string;
		savedAt: number;
	}>;
	subscribeSessionUpdated?: (
		handler: (session: ChatSessionSummary) => void,
	) => () => void;
}

export interface UseChatSessionsResult<UI_MESSAGE> {
	sessions: ChatSessionSummary[];
	activeSessionId: string;
	messagesForActiveSession: UI_MESSAGE[];
	isSwitchingSession: boolean;
	loadError: string | null;
	saveError: string | null;
	setMessagesForActiveSession: (messages: UI_MESSAGE[]) => void;
	createNewSession: () => Promise<void>;
	selectSession: (sessionId: string) => Promise<void>;
	reloadActiveSession: () => Promise<void>;
	persistActiveSession: () => Promise<string>;
}

export type ChatToolPart = DynamicToolUIPart | ToolUIPart<any>;

export type ChatDataPartRenderer<UI_MESSAGE extends UIMessage> = (input: {
	part: UI_MESSAGE["parts"][number];
	message: UI_MESSAGE;
	messageIndex: number;
	partIndex: number;
	status: ChatStatus;
}) => ReactNode | null;

export type ChatToolPartRenderer<UI_MESSAGE extends UIMessage> = (input: {
	part: ChatToolPart;
	message: UI_MESSAGE;
	messageIndex: number;
	partIndex: number;
	status: ChatStatus;
	disableActions: boolean;
	onApprove: (approvalId: string) => void;
	onDeny: (approvalId: string) => void;
}) => ReactNode | null;

export type ChatUnsupportedPartRenderer<UI_MESSAGE extends UIMessage> = (input: {
	part: UI_MESSAGE["parts"][number];
	message: UI_MESSAGE;
	messageIndex: number;
	partIndex: number;
	status: ChatStatus;
}) => ReactNode | null;

export interface ChatComposerRenderInput {
	status: ChatStatus;
	placeholder: string;
	onSubmit: (text: string) => void;
	onStop: () => void;
}

export interface ChatConversationProps<UI_MESSAGE extends UIMessage> {
	chatId: string;
	transport: ChatTransport<UI_MESSAGE>;
	messages: UI_MESSAGE[];
	onMessagesChange: (messages: UI_MESSAGE[]) => void;
	onPersistRequest?: (messages: UI_MESSAGE[]) => Promise<void>;
	placeholder?: string;
	className?: string;
	renderDataPart?: ChatDataPartRenderer<UI_MESSAGE>;
	renderToolPart?: ChatToolPartRenderer<UI_MESSAGE>;
	renderUnsupportedPart?: ChatUnsupportedPartRenderer<UI_MESSAGE>;
	renderComposer?: (input: ChatComposerRenderInput) => ReactNode;
	onToolApproval?: (input: {
		approvalId: string;
		approved: boolean;
		reason?: string;
	}) => Promise<void> | void;
}
