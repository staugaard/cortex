import {
	Activity,
	Bot,
	ChevronRight,
	FileOutput,
	MessageSquare,
	Wrench,
} from "lucide-react";
import { MessageResponse } from "@/components/ai-elements/message";
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
		case "step-start":
			return `Step ${event.stepNumber ?? "?"} started`;
		case "step-finish":
			return `Step ${event.stepNumber ?? "?"} finished`;
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
		<details className="group py-1 text-sm text-foreground/90">
			<summary className="list-none cursor-pointer select-none">
				<div className="flex items-center justify-between gap-3 rounded-sm px-1 py-0.5 hover:bg-black/5">
					<div className="flex min-w-0 items-center gap-2">
						<span className="relative inline-flex size-4 items-center justify-center text-muted-foreground">
							<Bot className="size-4 transition-opacity duration-150 group-hover:opacity-0 group-open:opacity-0" />
							<ChevronRight className="absolute size-4 opacity-0 transition-[opacity,transform] duration-150 group-hover:opacity-100 group-open:opacity-100 group-open:rotate-90" />
						</span>
						<span className="shrink-0 font-medium">Agent</span>
						<span className="truncate font-mono text-muted-foreground">{promptPreview}</span>
					</div>
					<div className="shrink-0 font-mono text-[11px] text-muted-foreground">
						{activity.status}
					</div>
				</div>
			</summary>

			<div className="mt-3 space-y-3 border-l border-border/70 pl-4">
				<section>
					<div className="mb-1 flex items-center gap-2 text-sm font-medium">
						<MessageSquare className="size-4 text-muted-foreground" />
						<span>Prompt</span>
					</div>
					<p className="whitespace-pre-wrap px-2 py-1 font-mono text-xs">
						{activity.prompt ?? "Prompt not available."}
					</p>
				</section>

				<section>
					<div className="mb-1 flex items-center gap-2 text-sm font-medium">
						<Activity className="size-4 text-muted-foreground" />
						<span>Activity</span>
					</div>
					{visibleEvents.length === 0 ? (
						<p className="text-xs text-muted-foreground">No activity recorded.</p>
					) : (
						<div className="space-y-1.5">
							{visibleEvents.map((event) => (
								<div key={event.id} className="px-2 py-1">
									<div className="flex items-center justify-between gap-2 text-xs">
										<span>{formatEventLabel(event)}</span>
										<span className="font-mono text-[10px] text-muted-foreground">
											{formatTimestamp(event.timestamp)}
										</span>
									</div>
									{event.type.startsWith("tool-call") ? (
										<div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
											<Wrench className="size-3" />
											<span>{event.toolName ?? "tool"}</span>
										</div>
									) : null}
									{event.error ? (
										<pre className="mt-1 overflow-x-auto rounded-sm bg-red-50 px-2 py-1 text-[11px] text-red-700">
											{event.error}
										</pre>
									) : null}
									{event.input != null ? (
										<pre className="mt-1 overflow-x-auto rounded-sm bg-black/5 px-2 py-1 text-[11px]">
											{formatPayload(event.input)}
										</pre>
									) : null}
								</div>
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
			</div>
		</details>
	);
}
