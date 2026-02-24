import type { UIMessage, UIMessageChunk } from "ai";
import type { ChatElectrobunSchema } from "@cortex/chat-core/rpc";

export type AgentActivityStatus =
	| "running"
	| "completed"
	| "cancelled"
	| "error";

export type AgentActivityWorkflow = "direct" | "delegate" | "math-expert";

export interface AgentActivityEvent {
	id: string;
	timestamp: number;
	source: string;
	type:
		| "start"
		| "step-start"
		| "tool-call-start"
		| "tool-call-finish"
		| "step-finish"
		| "finish"
		| "cancelled"
		| "error"
		| "note";
	stepNumber?: number;
	toolCallId?: string;
	toolName?: string;
	input?: unknown;
	output?: unknown;
	success?: boolean;
	durationMs?: number;
	error?: string;
	message?: string;
}

export interface AgentActivityData {
	activityId: string;
	workflow: AgentActivityWorkflow;
	status: AgentActivityStatus;
	prompt?: string;
	output?: string;
	startedAt: number;
	updatedAt: number;
	finishedAt?: number;
	counters: {
		steps: number;
		toolCalls: number;
		completedRuns: number;
		cancelledRuns: number;
		failedRuns: number;
	};
	events: AgentActivityEvent[];
}

export type ChatDataParts = {
	agentActivity: AgentActivityData;
};

export type ChatUIMessage = UIMessage<unknown, ChatDataParts>;
export type ChatUIChunk = UIMessageChunk<unknown, ChatDataParts>;
export type AppChatSchema = ChatElectrobunSchema<ChatUIMessage, ChatUIChunk>;

export const TEMP_SESSION_PREFIX = "tmp:";

export function createTemporarySessionId(): string {
	return `${TEMP_SESSION_PREFIX}${crypto.randomUUID()}`;
}
