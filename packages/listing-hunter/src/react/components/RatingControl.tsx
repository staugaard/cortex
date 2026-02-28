import { useState, useCallback } from "react";
import { cn } from "@cortex/core-ui";
import { Textarea } from "@cortex/core-ui";
import { Star } from "lucide-react";

export type RatingControlProps = {
	value: number | null;
	onRate: (rating: 1 | 2 | 3 | 4 | 5) => void;
	showNote?: boolean;
	note?: string | null;
	onNoteChange?: (note: string) => void;
	label?: string;
	readOnly?: boolean;
	compact?: boolean;
	className?: string;
};

export function RatingControl({
	value,
	onRate,
	showNote,
	note,
	onNoteChange,
	label,
	readOnly,
	compact,
	className,
}: RatingControlProps) {
	const [hovered, setHovered] = useState<number | null>(null);

	const handleClick = useCallback(
		(star: 1 | 2 | 3 | 4 | 5) => {
			if (readOnly) return;
			onRate(star);
		},
		[readOnly, onRate],
	);

	const displayValue = hovered ?? value ?? 0;
	const starSize = compact ? 14 : 18;
	const noteVisible = showNote && value != null && value > 0;

	return (
		<div className={cn("flex flex-col", className)}>
			{label && !compact && (
				<span className="mb-1 text-xs font-medium text-muted-foreground">
					{label}
				</span>
			)}

			<div
				className={cn("flex items-center", compact ? "gap-0.5" : "gap-1")}
				onMouseLeave={() => !readOnly && setHovered(null)}
			>
				{([1, 2, 3, 4, 5] as const).map((star) => {
					const filled = star <= displayValue;
					return (
						<button
							key={star}
							type="button"
							disabled={readOnly}
							className={cn(
								"relative inline-flex items-center justify-center rounded-sm transition-transform duration-150",
								compact ? "p-0" : "p-0.5",
								readOnly
									? "cursor-default opacity-60"
									: "cursor-pointer active:scale-90",
							)}
							onMouseEnter={() => !readOnly && setHovered(star)}
							onClick={() => handleClick(star)}
						>
							<Star
								size={starSize}
								className={cn(
									"transition-colors duration-150",
									filled
										? "fill-warning text-warning"
										: "fill-transparent text-tertiary",
									!readOnly &&
										hovered !== null &&
										"drop-shadow-[0_0_1px_rgba(255,149,0,0.3)]",
								)}
								strokeWidth={compact ? 2 : 1.75}
							/>
						</button>
					);
				})}
			</div>

			{/* Animated note area */}
			<div
				className={cn(
					"grid transition-[grid-template-rows] duration-200 ease-out",
					noteVisible ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
				)}
			>
				<div className="overflow-hidden">
					{showNote && (
						<Textarea
							placeholder="Add a note…"
							value={note ?? ""}
							onChange={(e) => onNoteChange?.(e.target.value)}
							className="mt-2 min-h-[4rem] resize-none text-xs"
						/>
					)}
				</div>
			</div>
		</div>
	);
}
