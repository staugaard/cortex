import { useState, useEffect, useRef } from "react";
import { cn, Button, Spinner } from "@cortex/core-ui";
import { Play } from "lucide-react";
import type { PipelineRunStats } from "@cortex/listing-hunter/types";

export type PipelineStatusBarProps = {
	running: boolean;
	statusText?: string;
	stats?: PipelineRunStats | null;
	onRunPipeline: () => void;
	disabled?: boolean;
	className?: string;
};

export function PipelineStatusBar({
	running,
	statusText,
	stats,
	onRunPipeline,
	disabled,
	className,
}: PipelineStatusBarProps) {
	const [showStats, setShowStats] = useState(false);
	const prevRunning = useRef(running);

	// When running transitions false → show completed stats briefly
	useEffect(() => {
		if (prevRunning.current && !running && stats) {
			setShowStats(true);
			const timer = setTimeout(() => setShowStats(false), 3000);
			return () => clearTimeout(timer);
		}
		prevRunning.current = running;
	}, [running, stats]);

	// Running state
	if (running) {
		return (
			<div className={cn("inline-flex items-center gap-2", className)}>
				<Spinner className="size-3.5 text-muted-foreground" />
				<span className="animate-pulse text-xs text-muted-foreground">
					{statusText || "Discovering listings\u2026"}
				</span>
			</div>
		);
	}

	// Completed flash
	if (showStats && stats) {
		return (
			<div className={cn("inline-flex items-center gap-2", className)}>
				<span className="text-xs font-medium text-emerald-600">
					Found {stats.new} new, rated {stats.rated}
				</span>
			</div>
		);
	}

	// Idle
	return (
		<div className={cn("inline-flex items-center", className)}>
			<Button
				variant="outline"
				size="sm"
				onClick={onRunPipeline}
				disabled={disabled}
			>
				<Play className="size-3.5" />
				Run Pipeline
			</Button>
		</div>
	);
}
