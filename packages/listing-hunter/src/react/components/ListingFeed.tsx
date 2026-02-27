import {
	cn,
	Tabs,
	TabsList,
	TabsTrigger,
	ScrollArea,
	Badge,
	Button,
	Spinner,
} from "@cortex/core-ui";
import { Sparkles, Star, Inbox, ArchiveX } from "lucide-react";
import type { BaseListing, ListingFilter } from "@cortex/listing-hunter/types";
import { ListingCard } from "./ListingCard";

export type ListingFeedProps<T extends BaseListing> = {
	listings: T[];
	total: number;
	loading: boolean;
	activeFilter: ListingFilter;
	onFilterChange: (filter: ListingFilter) => void;
	onLoadMore: () => void;
	hasMore: boolean;
	loadingMore: boolean;
	onRate: (id: string, rating: 1 | 2 | 3 | 4 | 5) => void;
	onRateNote: (id: string, note: string) => void;
	onArchive: (id: string) => void;
	renderFields?: (listing: T) => React.ReactNode;
	headerSlot?: React.ReactNode;
	className?: string;
};

const filterConfig: {
	value: ListingFilter;
	label: string;
}[] = [
	{ value: "new", label: "New" },
	{ value: "shortlist", label: "Shortlist" },
	{ value: "all", label: "All" },
	{ value: "archived", label: "Archived" },
];

const emptyStates: Record<
	ListingFilter,
	{ icon: React.ElementType; title: string; subtitle?: string }
> = {
	new: {
		icon: Sparkles,
		title: "No new listings to review",
	},
	shortlist: {
		icon: Star,
		title: "No shortlisted listings yet",
		subtitle: "Rate listings 4–5 stars to add them here",
	},
	all: {
		icon: Inbox,
		title: "No listings discovered yet",
		subtitle: "Run the pipeline to find listings",
	},
	archived: {
		icon: ArchiveX,
		title: "No archived listings",
	},
};

export function ListingFeed<T extends BaseListing>({
	listings,
	total,
	loading,
	activeFilter,
	onFilterChange,
	onLoadMore,
	hasMore,
	loadingMore,
	onRate,
	onRateNote,
	onArchive,
	renderFields,
	headerSlot,
	className,
}: ListingFeedProps<T>) {
	return (
		<div className={cn("flex min-h-0 flex-1 flex-col", className)}>
			{/* Header slot */}
			{headerSlot}

			{/* Filter tabs */}
			<div className="shrink-0 px-4 pt-3">
				<Tabs
					value={activeFilter}
					onValueChange={(v) => onFilterChange(v as ListingFilter)}
				>
					<TabsList className="w-full">
						{filterConfig.map(({ value, label }) => (
							<TabsTrigger key={value} value={value} className="flex-1 gap-1.5">
								{label}
								{value === "all" && total > 0 && (
									<Badge
										variant="secondary"
										className="px-1.5 py-0 text-[11px]"
									>
										{total}
									</Badge>
								)}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
			</div>

			{/* Listing count */}
			<div className="shrink-0 px-4 py-1">
				<span className="text-xs text-muted-foreground">
					{loading ? "Loading…" : `${total} listing${total !== 1 ? "s" : ""}`}
				</span>
			</div>

			{/* Scrollable content */}
			<ScrollArea className="min-h-0 flex-1">
				<div className="space-y-3 px-4 py-3">
					{/* Loading skeleton */}
					{loading &&
						Array.from({ length: 3 }).map((_, i) => (
							<div
								key={i}
								className="mx-auto max-w-lg animate-pulse rounded-lg bg-muted"
								style={{ height: 280 }}
							/>
						))}

					{/* Empty state */}
					{!loading && listings.length === 0 && (
						<EmptyState filter={activeFilter} />
					)}

					{/* Cards */}
					{!loading &&
						listings.map((listing) => (
							<ListingCard
								key={listing.id}
								listing={listing}
								renderFields={renderFields}
								onRate={onRate}
								onRateNote={onRateNote}
								onArchive={onArchive}
								className="mx-auto max-w-lg"
							/>
						))}

					{/* Load more */}
					{!loading && hasMore && (
						<div className="mx-auto max-w-lg pt-1 pb-2">
							<Button
								variant="outline"
								className="w-full"
								onClick={onLoadMore}
								disabled={loadingMore}
							>
								{loadingMore && <Spinner />}
								Load more listings
							</Button>
						</div>
					)}
				</div>
			</ScrollArea>
		</div>
	);
}

function EmptyState({ filter }: { filter: ListingFilter }) {
	const { icon: Icon, title, subtitle } = emptyStates[filter];
	return (
		<div className="flex flex-col items-center justify-center gap-3 py-16">
			<Icon className="size-8 text-muted-foreground/40" strokeWidth={1.5} />
			<div className="text-center">
				<p className="text-sm font-medium text-muted-foreground">{title}</p>
				{subtitle && (
					<p className="mt-1 text-xs text-muted-foreground/70">{subtitle}</p>
				)}
			</div>
		</div>
	);
}
