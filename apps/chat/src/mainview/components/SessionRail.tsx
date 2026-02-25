import type { ChatSessionSummary } from "@cortex/chat-core/react";

type SessionRailProps = {
	sessions: ChatSessionSummary[];
	activeSessionId: string;
	onNewSession: () => void;
	onSelectSession: (sessionId: string) => void;
	disabled?: boolean;
};

function formatTitle(session: ChatSessionSummary): string {
	return session.title?.trim() || "New Conversation";
}

export function SessionRail({
	sessions,
	activeSessionId,
	onNewSession,
	onSelectSession,
	disabled,
}: SessionRailProps) {
	return (
		<aside className="flex w-[260px] shrink-0 flex-col border-r border-border bg-muted/40">
			<div className="flex items-center justify-between border-b border-border px-3 py-2">
				<span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
					Sessions
				</span>
				<button
					type="button"
					onClick={onNewSession}
					disabled={disabled}
					className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
				>
					New Chat
				</button>
			</div>

			<div className="flex-1 overflow-y-auto p-2">
				{sessions.length === 0 ? (
					<p className="px-2 py-3 text-[12px] text-muted-foreground">
						No conversations yet.
					</p>
				) : (
					<div className="space-y-1">
						{sessions.map((session) => {
							const isActive = session.sessionId === activeSessionId;
							return (
								<button
									type="button"
									key={session.sessionId}
									onClick={() =>
										onSelectSession(session.sessionId)
									}
									disabled={disabled}
									className={`w-full rounded-md px-2.5 py-2 text-left text-[12px] transition-colors ${
										isActive
											? "bg-black/10 text-foreground"
											: "text-muted-foreground hover:bg-black/5 hover:text-foreground"
									} disabled:cursor-not-allowed disabled:opacity-50`}
								>
									<p className="truncate font-medium">
										{formatTitle(session)}
									</p>
									<p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
										{session.sessionId}
									</p>
								</button>
							);
						})}
					</div>
				)}
			</div>
		</aside>
	);
}
