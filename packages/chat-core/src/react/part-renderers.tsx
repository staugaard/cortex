import {
	isDataUIPart,
	isReasoningUIPart,
	isTextUIPart,
	isToolOrDynamicToolUIPart,
	type ChatStatus,
	type UIMessage,
} from "ai";
import type { ReactNode } from "react";
import {
	Confirmation,
	ConfirmationAccepted,
	ConfirmationAction,
	ConfirmationActions,
	ConfirmationRejected,
	ConfirmationRequest,
	ConfirmationTitle,
} from "./components/ai-elements/confirmation";
import { CodeBlock } from "./components/ai-elements/code-block";
import {
	MessageResponse,
} from "./components/ai-elements/message";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "./components/ai-elements/reasoning";
import { Shimmer } from "./components/ai-elements/shimmer";
import {
	Snippet,
	SnippetCopyButton,
	SnippetInput,
} from "./components/ai-elements/snippet";
import {
	Tool,
	ToolContent,
	ToolHeader,
	ToolInput,
	ToolOutput,
} from "./components/ai-elements/tool";
import { AgentActivityPart, asAgentActivityData } from "./agent-activity-part";
import type {
	ChatDataPartRenderer,
	ChatToolPart,
	ChatToolPartRenderer,
	ChatUnsupportedPartRenderer,
} from "./types";

function toolErrorTextFromPart(part: ChatToolPart): string | undefined {
	return "errorText" in part ? part.errorText : undefined;
}

function toolOutputFromPart(part: ChatToolPart): unknown {
	return "output" in part ? part.output : undefined;
}

function toolApprovalIdFromPart(part: ChatToolPart): string | undefined {
	return part.approval?.id;
}

function stringifyUnknown(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function DefaultToolPart({
	part,
	disableActions,
	onApprove,
	onDeny,
}: {
	part: ChatToolPart;
	disableActions: boolean;
	onApprove: (approvalId: string) => void;
	onDeny: (approvalId: string) => void;
}) {
	const toolCallId = part.toolCallId;
	const toolState = part.state;
	const toolErrorText = toolErrorTextFromPart(part);
	const toolOutput = toolOutputFromPart(part);
	const approvalId = toolApprovalIdFromPart(part);
	const hasApproval = part.approval != null;
	const canRespondToApproval =
		part.state === "approval-requested" && typeof approvalId === "string";

	return (
		<Tool defaultOpen={toolState !== "output-available"}>
			{part.type === "dynamic-tool" ? (
				<ToolHeader type={part.type} state={toolState} toolName={part.toolName} />
			) : (
				<ToolHeader type={part.type} state={toolState} />
			)}
			<ToolContent>
				{toolCallId ? (
					<Snippet code={toolCallId}>
						<SnippetInput aria-label="Tool call ID" />
						<SnippetCopyButton />
					</Snippet>
				) : null}
				{part.state === "input-streaming" ? (
					<Shimmer>Streaming tool input...</Shimmer>
				) : null}
				{part.input != null ? <ToolInput input={part.input} /> : null}
				<ToolOutput output={toolOutput} errorText={toolErrorText} />
				{hasApproval ? (
					<Confirmation approval={part.approval} state={part.state}>
						<ConfirmationTitle>Approval Required</ConfirmationTitle>
						<ConfirmationRequest>
							This tool call requires explicit approval before execution.
						</ConfirmationRequest>
						<ConfirmationAccepted>Approved.</ConfirmationAccepted>
						<ConfirmationRejected>Denied.</ConfirmationRejected>
						<ConfirmationActions>
							<ConfirmationAction
								onClick={() => {
									if (approvalId) {
										onApprove(approvalId);
									}
								}}
								disabled={disableActions || !canRespondToApproval}
							>
								Approve
							</ConfirmationAction>
							<ConfirmationAction
								variant="outline"
								onClick={() => {
									if (approvalId) {
										onDeny(approvalId);
									}
								}}
								disabled={disableActions || !canRespondToApproval}
							>
								Deny
							</ConfirmationAction>
						</ConfirmationActions>
					</Confirmation>
				) : null}
			</ToolContent>
		</Tool>
	);
}

export function renderMessagePart<UI_MESSAGE extends UIMessage>(input: {
	part: UI_MESSAGE["parts"][number];
	message: UI_MESSAGE;
	messageIndex: number;
	partIndex: number;
	status: ChatStatus;
	renderDataPart?: ChatDataPartRenderer<UI_MESSAGE>;
	renderToolPart?: ChatToolPartRenderer<UI_MESSAGE>;
	renderUnsupportedPart?: ChatUnsupportedPartRenderer<UI_MESSAGE>;
	disableToolActions: boolean;
	onApproveToolCall: (approvalId: string) => void;
	onDenyToolCall: (approvalId: string) => void;
}): ReactNode {
	const {
		part,
		message,
		messageIndex,
		partIndex,
		status,
		renderDataPart,
		renderToolPart,
		renderUnsupportedPart,
		disableToolActions,
		onApproveToolCall,
		onDenyToolCall,
	} = input;

	if (isTextUIPart(part)) {
		return (
			<MessageResponse
				key={`${message.id}-${partIndex}-text`}
				isAnimating={
					(status === "streaming" || status === "submitted") &&
					message.role === "assistant"
				}
			>
				{part.text}
			</MessageResponse>
		);
	}

	if (isReasoningUIPart(part)) {
		return (
			<Reasoning
				key={`${message.id}-${partIndex}-reasoning`}
				isStreaming={part.state === "streaming"}
			>
				<ReasoningTrigger />
				<ReasoningContent>{part.text}</ReasoningContent>
			</Reasoning>
		);
	}

	if (isDataUIPart(part)) {
		const customDataPart = renderDataPart?.({
			part,
			message,
			messageIndex,
			partIndex,
			status,
		});
		if (customDataPart != null) {
			return customDataPart;
		}

		if (part.type === "data-agentActivity") {
			const activity = asAgentActivityData(part.data);
			if (activity) {
				return (
					<AgentActivityPart
						key={`${message.id}-${partIndex}-agent-activity`}
						activity={activity}
					/>
				);
			}
		}
	}

	if (isToolOrDynamicToolUIPart(part)) {
		const toolPart = part as ChatToolPart;
		const customToolPart = renderToolPart?.({
			part: toolPart,
			message,
			messageIndex,
			partIndex,
			status,
			disableActions: disableToolActions,
			onApprove: onApproveToolCall,
			onDeny: onDenyToolCall,
		});
		if (customToolPart != null) {
			return customToolPart;
		}
		return (
			<DefaultToolPart
				key={`${message.id}-${partIndex}-tool`}
				part={toolPart}
				disableActions={disableToolActions}
				onApprove={onApproveToolCall}
				onDeny={onDenyToolCall}
			/>
		);
	}

	const customFallback = renderUnsupportedPart?.({
		part,
		message,
		messageIndex,
		partIndex,
		status,
	});
	if (customFallback != null) {
		return customFallback;
	}

	return (
		<div key={`${message.id}-${partIndex}-unsupported`} className="max-w-full">
			<CodeBlock
				code={stringifyUnknown({
					type: part.type,
					part,
				})}
				language="json"
			/>
		</div>
	);
}
