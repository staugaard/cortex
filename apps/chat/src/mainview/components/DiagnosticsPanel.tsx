import type { ChatStatus } from "ai";
import { DEFAULT_SESSION_ID } from "../chat-types";

export function DiagnosticsPanel({
	messageCount,
	status,
}: {
	messageCount: number;
	status: ChatStatus;
}) {
	const isStreaming = status === "streaming" || status === "submitted";

	return (
		<aside className="panel-in w-[200px] shrink-0 overflow-y-auto border-l border-border bg-muted p-3">
			<h3 className="text-[11px] font-semibold uppercase tracking-wider text-tertiary">
				Diagnostics
			</h3>
			<dl className="mt-2.5 space-y-1.5 text-[12px]">
				<div className="flex justify-between">
					<dt className="text-muted-foreground">Messages</dt>
					<dd className="font-medium tabular-nums">
						{messageCount}
					</dd>
				</div>
				<div className="flex justify-between">
					<dt className="text-muted-foreground">Status</dt>
					<dd className="font-medium">
						<span
							className={`inline-flex items-center gap-1 ${
								isStreaming ? "text-app-accent" : ""
							}`}
						>
							{isStreaming && (
								<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-app-accent" />
							)}
							{status}
						</span>
					</dd>
				</div>
				<div className="flex justify-between">
					<dt className="text-muted-foreground">Session</dt>
					<dd className="font-mono text-[11px]">
						{DEFAULT_SESSION_ID}
					</dd>
				</div>
			</dl>
		</aside>
	);
}
