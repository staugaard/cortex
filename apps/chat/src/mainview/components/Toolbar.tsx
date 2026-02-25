import type { ReactNode } from "react";

export function Toolbar({ onReload }: { onReload: () => void }) {
	return (
		<div className="flex h-[38px] shrink-0 items-center justify-between border-b border-border px-3 select-none">
			<span className="text-[13px] font-medium text-muted-foreground">
				Cortex Chat
			</span>
			<div className="flex items-center gap-0.5">
				<ToolbarButton onClick={onReload} title="Reload saved">
					<svg width="15" height="15" viewBox="0 0 15 15" fill="none">
						<path
							d="M1.85 7.5a5.65 5.65 0 1 1 1.65 4"
							stroke="currentColor"
							strokeWidth="1.3"
							strokeLinecap="round"
						/>
						<path
							d="M1.5 4v3.5H5"
							stroke="currentColor"
							strokeWidth="1.3"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</ToolbarButton>
			</div>
		</div>
	);
}

function ToolbarButton({
	children,
	onClick,
	title,
}: {
	children: ReactNode;
	onClick: () => void;
	title: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			title={title}
			className="flex h-[26px] w-[26px] items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground active:bg-black/10"
		>
			{children}
		</button>
	);
}
