import { useState } from "react";
import {
	cn,
	Card,
	Badge,
	Button,
	Tooltip,
	TooltipTrigger,
	TooltipContent,
	TooltipProvider,
} from "@cortex/core-ui";
import { ArchiveX, ExternalLink } from "lucide-react";
import type { BaseListing } from "@cortex/listing-hunter/types";
import { ListingImageCarousel } from "./ListingImageCarousel";
import { RatingControl } from "./RatingControl";

export type ListingCardProps<T extends BaseListing> = {
	listing: T;
	renderFields?: (listing: T) => React.ReactNode;
	onRate: (id: string, rating: 1 | 2 | 3 | 4 | 5) => void;
	onRateNote: (id: string, note: string) => void;
	onArchive: (id: string) => void;
	className?: string;
};

function formatRelativeTime(date: Date): string {
	const now = Date.now();
	const then = date instanceof Date ? date.getTime() : new Date(date).getTime();
	const diffMs = now - then;
	const diffSec = Math.floor(diffMs / 1000);
	if (diffSec < 60) return "just now";
	const diffMin = Math.floor(diffSec / 60);
	if (diffMin < 60) return `${diffMin}m ago`;
	const diffHr = Math.floor(diffMin / 60);
	if (diffHr < 24) return `${diffHr}h ago`;
	const diffDay = Math.floor(diffHr / 24);
	if (diffDay < 30) return `${diffDay}d ago`;
	const diffMo = Math.floor(diffDay / 30);
	return `${diffMo}mo ago`;
}

function aiRatingColor(rating: number) {
	if (rating >= 4) return "bg-emerald-100 text-emerald-700";
	if (rating === 3) return "bg-amber-100 text-amber-700";
	return "bg-red-100 text-red-700";
}

export function ListingCard<T extends BaseListing>({
	listing,
	renderFields,
	onRate,
	onRateNote,
	onArchive,
	className,
}: ListingCardProps<T>) {
	const [expanded, setExpanded] = useState(false);
	const isNew = listing.userRating == null && !listing.archived;

	return (
		<Card
			className={cn(
				"gap-0 overflow-hidden rounded-lg py-0 shadow-none transition-shadow duration-150 hover:shadow-md",
				className,
			)}
		>
			{/* Image */}
			<ListingImageCarousel images={listing.images} alt={listing.title} />

			{/* Header */}
			<div className="flex items-start gap-2 px-3 pt-3">
				<h3 className="min-w-0 flex-1 truncate text-sm font-medium">
					{listing.title}
				</h3>
				<div className="flex shrink-0 items-center gap-1.5">
					{listing.aiRating != null && (
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<Badge
										variant="secondary"
										className={cn(
											"border-0 px-1.5 py-0 text-[11px] font-medium",
											aiRatingColor(listing.aiRating),
										)}
									>
										AI: {listing.aiRating}/5
									</Badge>
								</TooltipTrigger>
								{listing.aiRatingReason && (
									<TooltipContent side="bottom" className="max-w-64">
										{listing.aiRatingReason}
									</TooltipContent>
								)}
							</Tooltip>
						</TooltipProvider>
					)}
					{isNew && (
						<Badge className="border-0 bg-app-accent px-1.5 py-0 text-[11px] text-white">
							New
						</Badge>
					)}
				</div>
			</div>

			{/* Domain fields */}
			{renderFields && <div className="px-3 pt-1">{renderFields(listing)}</div>}

			{/* Description */}
			{listing.description && (
				<button
					type="button"
					className="px-3 pt-1 text-left"
					onClick={() => setExpanded((v) => !v)}
				>
					<p
						className={cn(
							"text-xs text-muted-foreground",
							!expanded && "line-clamp-2",
						)}
					>
						{listing.description}
					</p>
				</button>
			)}

			{/* Discovered date */}
			<div className="px-3 pt-1">
				<span className="text-[11px] text-muted-foreground">
					{formatRelativeTime(listing.discoveredAt)}
				</span>
			</div>

			{/* Footer */}
			<div className="mt-2 flex items-center justify-between border-t px-3 py-2">
				<RatingControl
					compact
					value={listing.userRating}
					onRate={(rating) => onRate(listing.id, rating)}
					showNote={listing.userRating != null}
					note={listing.userRatingNote}
					onNoteChange={(note) => onRateNote(listing.id, note)}
				/>
				<div className="flex items-center gap-0.5">
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon-xs"
									onClick={() => onArchive(listing.id)}
								>
									<ArchiveX className="size-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Archive</TooltipContent>
						</Tooltip>
					</TooltipProvider>
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant="ghost" size="icon-xs" asChild>
									<a
										href={listing.sourceUrl}
										target="_blank"
										rel="noopener noreferrer"
									>
										<ExternalLink className="size-3.5" />
									</a>
								</Button>
							</TooltipTrigger>
							<TooltipContent>View on {listing.sourceName}</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>
			</div>
		</Card>
	);
}
