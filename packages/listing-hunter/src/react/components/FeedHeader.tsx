import {
	cn,
	Button,
	Tooltip,
	TooltipTrigger,
	TooltipContent,
	TooltipProvider,
} from "@cortex/core-ui";
import { Settings2, RefreshCw, MessageCircle } from "lucide-react";

export type FeedHeaderProps = {
	title: string;
	subtitle?: string;
	onPreferences: () => void;
	onChat?: () => void;
	onRefresh: () => void;
	refreshing?: boolean;
	pipelineSlot?: React.ReactNode;
	className?: string;
};

export function FeedHeader({
	title,
	subtitle,
	onPreferences,
	onChat,
	onRefresh,
	refreshing,
	pipelineSlot,
	className,
}: FeedHeaderProps) {
	return (
		<header
			className={cn(
				"flex h-11 shrink-0 items-center justify-between border-b bg-background px-4",
				className,
			)}
		>
			{/* Left: title block */}
			<div className="flex min-w-0 flex-col justify-center">
				<h1 className="truncate text-sm font-semibold leading-tight">
					{title}
				</h1>
				{subtitle && (
					<span className="truncate text-[11px] leading-tight text-muted-foreground">
						{subtitle}
					</span>
				)}
			</div>

			{/* Center: pipeline status */}
			{pipelineSlot && <div className="mx-4">{pipelineSlot}</div>}

			{/* Right: actions */}
			<div className="flex shrink-0 items-center gap-1">
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon-xs"
								onClick={onPreferences}
							>
								<Settings2 className="size-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Preferences</TooltipContent>
					</Tooltip>
				</TooltipProvider>

				{onChat && (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon-xs"
									onClick={onChat}
								>
									<MessageCircle className="size-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Chat</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				)}

				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon-xs"
								onClick={onRefresh}
								disabled={refreshing}
							>
								<RefreshCw
									className={cn(
										"size-3.5",
										refreshing && "animate-spin",
									)}
								/>
							</Button>
						</TooltipTrigger>
						<TooltipContent>Refresh</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			</div>
		</header>
	);
}
