import { ToolLoopAgent, jsonSchema, stepCountIs, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import {
	createAgentActivityRecorder,
	createAgentLoopUIChunkStream,
	normalizeAgentUIChunkStream,
	runSubagentUIMessageStream,
	type AgentActivitySnapshot,
	type AgentLoopHooks,
} from "@cortex/chat-core/agents";
import type {
	AgentActivityData,
	AgentActivityWorkflow,
	ChatUIChunk,
	ChatUIMessage,
} from "../mainview/chat-types";

export const CHAT_MODEL_ID = "claude-sonnet-4-6";
const INTERNAL_MANAGER_TOOL_NAMES = ["ask_math_expert"] as const;

type ArithmeticToken = {
	type: "number" | "operator" | "paren";
	value: string;
};

function tokenizeArithmeticExpression(expression: string): ArithmeticToken[] {
	const tokens: ArithmeticToken[] = [];
	let index = 0;

	while (index < expression.length) {
		const char = expression[index];
		if (!char) {
			break;
		}

		if (/\s/.test(char)) {
			index += 1;
			continue;
		}

		if (/[+\-*/]/.test(char)) {
			tokens.push({ type: "operator", value: char });
			index += 1;
			continue;
		}

		if (char === "(" || char === ")") {
			tokens.push({ type: "paren", value: char });
			index += 1;
			continue;
		}

		if (/\d|\./.test(char)) {
			let dotCount = 0;
			let start = index;
			while (index < expression.length) {
				const current = expression[index];
				if (!current || (!/\d/.test(current) && current !== ".")) {
					break;
				}
				if (current === ".") {
					dotCount += 1;
					if (dotCount > 1) {
						throw new Error(
							`Invalid arithmetic expression: malformed number near "${expression.slice(start, index + 1)}"`,
						);
					}
				}
				index += 1;
			}

			const value = expression.slice(start, index);
			if (value === "." || value.length === 0) {
				throw new Error("Invalid arithmetic expression: malformed number");
			}
			tokens.push({ type: "number", value });
			continue;
		}

		throw new Error(
			`Invalid arithmetic expression: unsupported character "${char}"`,
		);
	}

	return tokens;
}

function evaluateArithmeticExpression(expression: string): {
	result: number;
	steps: string[];
} {
	const tokens = tokenizeArithmeticExpression(expression);
	if (tokens.length === 0) {
		throw new Error("Invalid arithmetic expression: input is empty");
	}

	let index = 0;

	const peek = (): ArithmeticToken | undefined => tokens[index];
	const consume = (): ArithmeticToken | undefined => {
		const token = tokens[index];
		if (token) {
			index += 1;
		}
		return token;
	};

	const parseFactor = (): number => {
		const token = peek();
		if (!token) {
			throw new Error("Invalid arithmetic expression: unexpected end of input");
		}

		if (token.type === "operator" && (token.value === "+" || token.value === "-")) {
			consume();
			const value = parseFactor();
			return token.value === "-" ? -value : value;
		}

		if (token.type === "number") {
			consume();
			const parsed = Number(token.value);
			if (!Number.isFinite(parsed)) {
				throw new Error(`Invalid number "${token.value}"`);
			}
			return parsed;
		}

		if (token.type === "paren" && token.value === "(") {
			consume();
			const value = parseExpression();
			const closing = consume();
			if (!closing || closing.type !== "paren" || closing.value !== ")") {
				throw new Error(
					'Invalid arithmetic expression: expected closing ")"',
				);
			}
			return value;
		}

		throw new Error(
			`Invalid arithmetic expression: unexpected token "${token.value}"`,
		);
	};

	const parseTerm = (): number => {
		let value = parseFactor();
		while (true) {
			const token = peek();
			if (!token || token.type !== "operator") {
				break;
			}
			if (token.value !== "*" && token.value !== "/") {
				break;
			}

			consume();
			const rhs = parseFactor();
			if (token.value === "*") {
				value *= rhs;
			} else {
				if (rhs === 0) {
					throw new Error("Invalid arithmetic expression: division by zero");
				}
				value /= rhs;
			}
		}
		return value;
	};

	const parseExpression = (): number => {
		let value = parseTerm();
		while (true) {
			const token = peek();
			if (!token || token.type !== "operator") {
				break;
			}
			if (token.value !== "+" && token.value !== "-") {
				break;
			}

			consume();
			const rhs = parseTerm();
			value = token.value === "+" ? value + rhs : value - rhs;
		}
		return value;
	};

	const result = parseExpression();
	if (index !== tokens.length) {
		const token = tokens[index];
		throw new Error(
			`Invalid arithmetic expression: unexpected token "${token?.value ?? "?"}"`,
		);
	}

	const normalizedResult = Number(result.toFixed(12));
	return {
		result: normalizedResult,
		steps: [`${expression.trim()} = ${normalizedResult}`],
	};
}

function offsetMinutesForTimeZone(date: Date, timeZone: string): number {
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
	const parts = formatter.formatToParts(date);
	const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	const utcMillis = Date.UTC(
		Number(map.year),
		Number(map.month) - 1,
		Number(map.day),
		Number(map.hour),
		Number(map.minute),
		Number(map.second),
	);
	return Math.round((utcMillis - date.getTime()) / 60000);
}

function offsetLabel(offsetMinutes: number): string {
	const sign = offsetMinutes >= 0 ? "+" : "-";
	const absolute = Math.abs(offsetMinutes);
	const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
	const minutes = String(absolute % 60).padStart(2, "0");
	return `${sign}${hours}:${minutes}`;
}

function createIsoLocalTime(date: Date, timeZone: string, offsetMinutes: number): string {
	const formatter = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
	const parts = formatter.formatToParts(date);
	const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}${offsetLabel(offsetMinutes)}`;
}

const mathExpertAgent = new ToolLoopAgent({
	model: anthropic(CHAT_MODEL_ID),
	instructions:
		"You are a math expert subagent. For arithmetic expressions, call solve_arithmetic to compute the result. Then return a concise markdown response with the result and one short justification line.",
	tools: {
		solve_arithmetic: tool<
			{ expression: string },
			{ expression: string; result: number; steps: string[] }
		>({
			description:
				"Solve arithmetic expressions with +, -, *, /, parentheses, and decimals.",
			inputSchema: jsonSchema<{ expression: string }>({
				type: "object",
				properties: {
					expression: {
						type: "string",
						description: "The arithmetic expression to evaluate.",
					},
				},
				required: ["expression"],
				additionalProperties: false,
			}),
			execute: async ({ expression }) => {
				const evaluation = evaluateArithmeticExpression(expression);
				return {
					expression,
					result: evaluation.result,
					steps: evaluation.steps,
				};
			},
		}),
	},
});

export interface CreateChatRunUIChunkStreamInput {
	chatId: string;
	runId: string;
	messages: ChatUIMessage[];
	abortSignal: AbortSignal;
	onActivityUpdate: (activity: AgentActivityData) => void;
}

function extractTextFromMessage(message: ChatUIMessage | undefined): string {
	if (!message) {
		return "";
	}

	return message.parts
		.filter(
			(part): part is Extract<typeof part, { type: "text" }> =>
				part.type === "text",
		)
		.map((part) => part.text)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();
}

function createSubagentPromptMessage(text: string): ChatUIMessage {
	return {
		id: crypto.randomUUID(),
		role: "user",
		parts: [{ type: "text", text }],
	};
}

function toAgentActivityData(input: {
	workflow: AgentActivityWorkflow;
	snapshot: AgentActivitySnapshot;
	prompt?: string;
	output?: string;
}): AgentActivityData {
	const filteredEvents = input.snapshot.entries.filter(
		(event) =>
			event.source === "subagent" ||
			event.type === "error" ||
			event.type === "cancelled",
	);
	const counters = {
		steps: filteredEvents.filter((event) => event.type === "step-start").length,
		toolCalls: filteredEvents.filter((event) => event.type === "tool-call-start")
			.length,
		completedRuns: input.snapshot.status === "completed" ? 1 : 0,
		cancelledRuns: input.snapshot.status === "cancelled" ? 1 : 0,
		failedRuns: input.snapshot.status === "error" ? 1 : 0,
	};

	return {
		activityId: input.snapshot.activityId,
		workflow: input.workflow,
		status: input.snapshot.status,
		prompt: input.prompt,
		output: input.output,
		startedAt: input.snapshot.startedAt,
		updatedAt: input.snapshot.updatedAt,
		finishedAt: input.snapshot.finishedAt,
		counters,
		events: filteredEvents.map((event) => ({ ...event })),
	};
}

function createManagerAgent(input: {
	onDelegate: (query: string) => Promise<void>;
	onRedundantDelegate?: () => Promise<void>;
	runSubagent: (query: string, abortSignal?: AbortSignal) => Promise<string>;
}) {
	let delegatedResult: string | undefined;
	const mathToolName = "ask_math_expert";

	return new ToolLoopAgent({
		model: anthropic(CHAT_MODEL_ID),
		instructions:
			"You are a root assistant with tools. Rules: 1) For timezone or current-time questions, call get_local_time. 2) For explicit failure test requests, call always_fail_for_test. 3) For sensitive preview requests, call sensitive_action_preview and wait for approval. 4) For arithmetic, calculations, equations, probabilities, or unit conversions, call ask_math_expert exactly once. 5) For other requests, answer directly.",
		stopWhen: stepCountIs(8),
		prepareStep: ({ steps }) => {
			const alreadyDelegated = steps.some((step) =>
				step.toolCalls.some((call) => call.toolName === mathToolName),
			);
			if (!alreadyDelegated) {
				return;
			}
			return {
				activeTools: [],
				toolChoice: "none",
			};
		},
		tools: {
			get_local_time: tool<
				{ timezone: string; locale?: string },
				{
					timezone: string;
					locale: string;
					localTime: string;
					isoLocalTime: string;
					offsetMinutes: number;
				}
			>({
				description:
					"Return the current local time for an IANA timezone (for example Europe/Copenhagen).",
				inputSchema: jsonSchema<{ timezone: string; locale?: string }>({
					type: "object",
					properties: {
						timezone: {
							type: "string",
							description: "IANA timezone name.",
						},
						locale: {
							type: "string",
							description: "Optional locale, e.g. en-US.",
						},
					},
					required: ["timezone"],
					additionalProperties: false,
				}),
				execute: async ({ timezone, locale }) => {
					const effectiveLocale = locale || "en-US";
					const now = new Date();
					const formatter = new Intl.DateTimeFormat(effectiveLocale, {
						timeZone: timezone,
						year: "numeric",
						month: "2-digit",
						day: "2-digit",
						hour: "2-digit",
						minute: "2-digit",
						second: "2-digit",
						hour12: false,
					});
					const offsetMinutes = offsetMinutesForTimeZone(now, timezone);

					return {
						timezone,
						locale: effectiveLocale,
						localTime: formatter.format(now),
						isoLocalTime: createIsoLocalTime(now, timezone, offsetMinutes),
						offsetMinutes,
					};
				},
			}),
			always_fail_for_test: tool<{ reason: string }, { failed: true }>({
				description:
					"Intentional failure tool for UI testing. This always throws an error.",
				inputSchema: jsonSchema<{ reason: string }>({
					type: "object",
					properties: {
						reason: {
							type: "string",
							description: "Reason label to include in the thrown error.",
						},
					},
					required: ["reason"],
					additionalProperties: false,
				}),
				execute: async ({ reason }) => {
					throw new Error(`always_fail_for_test: ${reason}`);
				},
			}),
			sensitive_action_preview: tool<
				{ action: string; target?: string },
				{ action: string; target?: string; preview: string }
			>({
				description:
					"Generate a preview summary for a sensitive action. Requires explicit user approval before execution.",
				inputSchema: jsonSchema<{ action: string; target?: string }>({
					type: "object",
					properties: {
						action: {
							type: "string",
							description: "Action being proposed.",
						},
						target: {
							type: "string",
							description: "Optional target resource.",
						},
					},
					required: ["action"],
					additionalProperties: false,
				}),
				needsApproval: true,
				execute: async ({ action, target }) => {
					return {
						action,
						target,
						preview: target
							? `Preview: ${action} on ${target}.`
							: `Preview: ${action}.`,
					};
				},
			}),
			ask_math_expert: tool<{ query: string }, string>({
				description:
					"Ask the math expert to solve a math-focused user request and return the expert's answer.",
				inputSchema: jsonSchema<{ query: string }>({
					type: "object",
					properties: {
						query: {
							type: "string",
							description: "The exact user request to solve.",
						},
					},
					required: ["query"],
					additionalProperties: false,
				}),
				execute: async ({ query }, options) => {
					if (delegatedResult !== undefined) {
						if (input.onRedundantDelegate) {
							await input.onRedundantDelegate();
						}
						return delegatedResult;
					}

					await input.onDelegate(query);
					delegatedResult = await input.runSubagent(query, options.abortSignal);
					return delegatedResult;
				},
			}),
		},
	});
}

export async function createChatRunUIChunkStream(
	input: CreateChatRunUIChunkStreamInput,
): Promise<ReadableStream<ChatUIChunk>> {
	const activityId = `agent-activity:${input.runId}`;
	let resolvedWorkflow: AgentActivityWorkflow = "direct";
	let hasDelegated = false;
	let delegatedPrompt: string | undefined;
	let delegatedOutput: string | undefined;

	const safeEmitActivity = (snapshot: AgentActivitySnapshot): void => {
		if (!hasDelegated) {
			return;
		}

		try {
			input.onActivityUpdate(
				toAgentActivityData({
					snapshot,
					workflow: resolvedWorkflow,
					prompt: delegatedPrompt,
					output: delegatedOutput,
				}),
			);
		} catch {
			// Diagnostic updates should not break agent streaming.
		}
	};

	const activityRecorder = createAgentActivityRecorder({
		activityId,
		onUpdate: (snapshot) => {
			safeEmitActivity(snapshot);
		},
	});

	const managerHooks = activityRecorder.createHooks("manager");
	const subagentHooks = activityRecorder.createHooks("subagent");

	input.abortSignal.addEventListener(
		"abort",
		() => {
			void activityRecorder.markCancelled("Run aborted by user");
		},
		{ once: true },
	);

	const managerAgent = createManagerAgent({
		onDelegate: async (query) => {
			hasDelegated = true;
			delegatedPrompt = query;
			resolvedWorkflow = "math-expert";
			await activityRecorder.addNote("manager", "Delegating to math expert");
		},
		onRedundantDelegate: async () => {
			await activityRecorder.addNote(
				"manager",
				"Redundant math delegation call ignored; reusing prior expert result",
			);
		},
		runSubagent: async (query, abortSignal) => {
			const subagentResult = await runSubagentUIMessageStream({
				agent: mathExpertAgent,
				uiMessages: [createSubagentPromptMessage(query)],
				abortSignal: abortSignal ?? input.abortSignal,
				hooks: subagentHooks as AgentLoopHooks<any>,
				onError: (error) => {
					void activityRecorder.markError(error);
				},
			});

			const subagentText = extractTextFromMessage(
				subagentResult.finalMessage as ChatUIMessage | undefined,
			);
			if (!subagentText) {
				await activityRecorder.addNote(
					"subagent",
					"Math expert completed with no text output",
				);
				delegatedOutput = "Math expert completed without a textual answer.";
				void safeEmitActivity(activityRecorder.getSnapshot());
				return delegatedOutput;
			}
			delegatedOutput = subagentText;
			void safeEmitActivity(activityRecorder.getSnapshot());
			return subagentText;
		},
	});

	const { stream } = await createAgentLoopUIChunkStream<
		ChatUIMessage,
		never,
		any,
		ChatUIChunk
	>({
		agent: managerAgent,
		uiMessages: input.messages,
		abortSignal: input.abortSignal,
		hooks: managerHooks as AgentLoopHooks<any>,
	});

	return normalizeAgentUIChunkStream(stream, {
		hiddenToolNames: INTERNAL_MANAGER_TOOL_NAMES,
		hideStepLifecycleChunks: true,
	});
}
