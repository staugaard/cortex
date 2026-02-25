import type { UIMessage, UIMessageChunk, UITool } from "ai";
import type { ChatElectrobunSchema } from "@cortex/chat-core/rpc";

export type AgentActivityStatus =
	| "running"
	| "completed"
	| "cancelled"
	| "error";

export type AgentActivityWorkflow = "math-expert";

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

export type ChatUITools = {
	get_local_time: UITool & {
		input: {
			timezone: string;
			locale?: string;
		};
		output: {
			timezone: string;
			locale: string;
			localTime: string;
			isoLocalTime: string;
			offsetMinutes: number;
		};
	};
	always_fail_for_test: UITool & {
		input: {
			reason: string;
		};
		output: {
			failed: true;
		};
	};
	sensitive_action_preview: UITool & {
		input: {
			action: string;
			target?: string;
		};
		output: {
			action: string;
			target?: string;
			preview: string;
		};
	};
	solve_arithmetic: UITool & {
		input: {
			expression: string;
		};
		output: {
			expression: string;
			result: number;
			steps: string[];
		};
	};
	ask_math_expert: UITool & {
		input: {
			query: string;
		};
		output: string;
	};
};

export type ChatUIMessage = UIMessage<unknown, ChatDataParts, ChatUITools>;
export type ChatUIChunk = UIMessageChunk<unknown, ChatDataParts>;
export type AppChatSchema = ChatElectrobunSchema<ChatUIMessage, ChatUIChunk>;
