import {
	Activity,
	Bot,
	ChevronDown,
	FileOutput,
	MessageSquare,
	Wrench,
} from "lucide-react";
import { Agent, AgentContent } from "@/components/ai-elements/agent";
import { CodeBlock } from "@/components/ai-elements/code-block";
import { MessageResponse } from "@/components/ai-elements/message";
import {
	Task,
	TaskContent,
	TaskItem,
	TaskItemFile,
	TaskTrigger,
} from "@/components/ai-elements/task";
import type { AgentActivityData, AgentActivityEvent } from "../chat-types";

function toSingleLine(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function previewPrompt(prompt: string | undefined): string {
	if (!prompt) {
		return "Working...";
	}

	const normalized = toSingleLine(prompt);
	if (normalized.length <= 56) {
		return normalized;
	}
	return `${normalized.slice(0, 56)}...`;
}

function formatTimestamp(timestamp: number): string {
	try {
		return new Date(timestamp).toLocaleTimeString();
	} catch {
		return String(timestamp);
	}
}

function formatEventLabel(event: AgentActivityEvent): string {
	switch (event.type) {
		case "tool-call-start":
			return `Tool ${event.toolName ?? "unknown"} called`;
		case "tool-call-finish":
			return `Tool ${event.toolName ?? "unknown"} finished`;
		case "cancelled":
			return "Cancelled";
		case "error":
			return "Error";
		case "note":
			return event.message ?? "Note";
		default:
			return event.type;
	}
}

function formatPayload(payload: unknown): string {
	if (payload == null) {
		return "";
	}
	if (typeof payload === "string") {
		return payload;
	}
	try {
		return JSON.stringify(payload, null, 2);
	} catch {
		return String(payload);
	}
}

export function AgentActivityItem({ activity }: { activity: AgentActivityData }) {
	const promptPreview = previewPrompt(activity.prompt);
	const visibleEvents = activity.events.filter((event) => {
		switch (event.type) {
			case "start":
			case "finish":
			case "step-start":
			case "step-finish":
				return false;
			default:
				return true;
		}
	});

	return (
		<Task defaultOpen={false} className="py-1 text-sm text-foreground/90">
			<TaskTrigger title={promptPreview}>
				<Agent className="rounded-none border-0">
					<div className="flex items-center justify-between gap-3 rounded-sm px-1 py-0.5 hover:bg-black/5">
						<div className="flex min-w-0 items-center gap-2">
							<Bot className="size-4 shrink-0 text-muted-foreground" />
							<span className="shrink-0 font-medium">Agent</span>
							<span className="truncate font-mono text-muted-foreground">
								{promptPreview}
							</span>
						</div>
						<div className="flex shrink-0 items-center gap-2">
							<span className="font-mono text-[11px] text-muted-foreground">
								{activity.status}
							</span>
							<ChevronDown className="-rotate-90 size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-0" />
						</div>
					</div>
				</Agent>
			</TaskTrigger>

			<TaskContent className="mt-3">
				<Agent className="rounded-none border-0">
					<AgentContent className="space-y-3 p-0">
						<section>
							<div className="mb-1 flex items-center gap-2 text-sm font-medium">
								<MessageSquare className="size-4 text-muted-foreground" />
								<span>Prompt</span>
							</div>
							<TaskItem className="whitespace-pre-wrap px-2 py-1 font-mono text-xs text-foreground">
								{activity.prompt ?? "Prompt not available."}
							</TaskItem>
						</section>

						<section>
							<div className="mb-1 flex items-center gap-2 text-sm font-medium">
								<Activity className="size-4 text-muted-foreground" />
								<span>Activity</span>
							</div>
							{visibleEvents.length === 0 ? (
								<TaskItem className="px-2 py-1 text-xs text-muted-foreground">
									No activity recorded.
								</TaskItem>
							) : (
								<div className="space-y-2">
									{visibleEvents.map((event) => (
										<TaskItem key={event.id} className="px-2 py-1 text-foreground">
											<div className="flex items-center justify-between gap-2 text-xs">
												<span>{formatEventLabel(event)}</span>
												<span className="font-mono text-[10px] text-muted-foreground">
													{formatTimestamp(event.timestamp)}
												</span>
											</div>
											{event.type.startsWith("tool-call") && event.toolName ? (
												<div className="mt-1">
													<TaskItemFile>
														<Wrench className="size-3" />
														<span>{event.toolName}</span>
													</TaskItemFile>
												</div>
											) : null}
											{event.input != null ? (
												<div className="mt-1 rounded-md bg-muted/50">
													<CodeBlock
														code={formatPayload(event.input)}
														language="json"
													/>
												</div>
											) : null}
											{event.output != null ? (
												<div className="mt-1 rounded-md bg-muted/50">
													<CodeBlock
														code={formatPayload(event.output)}
														language="json"
													/>
												</div>
											) : null}
											{event.error ? (
												<div className="mt-1 rounded-md bg-red-50 text-red-700">
													<CodeBlock code={event.error} language="markdown" />
												</div>
											) : null}
										</TaskItem>
									))}
								</div>
							)}
						</section>

						<section>
							<div className="mb-1 flex items-center gap-2 text-sm font-medium">
								<FileOutput className="size-4 text-muted-foreground" />
								<span>Output</span>
							</div>
							<div className="px-2 py-1 text-xs">
								<MessageResponse>
									{activity.output ?? "Waiting for output..."}
								</MessageResponse>
							</div>
						</section>
					</AgentContent>
				</Agent>
			</TaskContent>
		</Task>
	);
}
