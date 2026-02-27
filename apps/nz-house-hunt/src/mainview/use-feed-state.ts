import { useState, useCallback, useEffect, useRef } from "react";
import { appRpc } from "./rpc";
import type { ListingFilter, PipelineRunStats } from "@cortex/listing-hunter/types";

const PAGE_SIZE = 20;

export type RentalListing = Awaited<
	ReturnType<typeof appRpc.request.getListings>
>["listings"][number];

export interface UseFeedStateReturn {
	listings: RentalListing[];
	total: number;
	loading: boolean;
	loadingMore: boolean;
	hasMore: boolean;
	error: string | null;
	activeFilter: ListingFilter;
	setFilter: (filter: ListingFilter) => void;
	loadMore: () => void;
	refresh: () => void;
	rateListing: (id: string, rating: 1 | 2 | 3 | 4 | 5) => void;
	rateListingNote: (id: string, note: string) => void;
	archiveListing: (id: string) => void;
	runPipeline: () => void;
	pipelineRunning: boolean;
	pipelineStatus: string | null;
	pipelineStats: PipelineRunStats | null;
}

export function useFeedState(): UseFeedStateReturn {
	const [listings, setListings] = useState<RentalListing[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [activeFilter, setActiveFilter] = useState<ListingFilter>("new");
	const [offset, setOffset] = useState(0);

	const [pipelineRunning, setPipelineRunning] = useState(false);
	const [pipelineStatus, setPipelineStatus] = useState<string | null>(null);
	const [pipelineStats, setPipelineStats] = useState<PipelineRunStats | null>(
		null,
	);

	const filterRef = useRef(activeFilter);
	filterRef.current = activeFilter;

	// ─── Fetch listings ────────────────────────────────────────────────
	const fetchListings = useCallback(
		async (filter: ListingFilter, newOffset: number, append: boolean) => {
			if (!append) setLoading(true);
			else setLoadingMore(true);
			setError(null);

			try {
				const response = await appRpc.request.getListings({
					filter,
					limit: PAGE_SIZE,
					offset: newOffset,
				});
				setListings((prev) =>
					append ? [...prev, ...response.listings] : response.listings,
				);
				setTotal(response.total);
				setOffset(newOffset + response.listings.length);
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			} finally {
				setLoading(false);
				setLoadingMore(false);
			}
		},
		[],
	);

	// Initial load + filter changes
	useEffect(() => {
		void fetchListings(activeFilter, 0, false);
	}, [activeFilter, fetchListings]);

	const setFilter = useCallback((filter: ListingFilter) => {
		setActiveFilter(filter);
		setOffset(0);
	}, []);

	const loadMore = useCallback(() => {
		void fetchListings(filterRef.current, offset, true);
	}, [offset, fetchListings]);

	const refresh = useCallback(() => {
		setOffset(0);
		void fetchListings(filterRef.current, 0, false);
	}, [fetchListings]);

	// ─── Optimistic rating ─────────────────────────────────────────────
	const rateListing = useCallback(
		(id: string, rating: 1 | 2 | 3 | 4 | 5) => {
			// Optimistic update
			setListings((prev) =>
				prev.map((l) => (l.id === id ? { ...l, userRating: rating } : l)),
			);
			// Fire RPC (no await needed for optimistic)
			void appRpc.request.rateListing({ id, rating }).catch(() => {
				// Revert on failure
				refresh();
			});
		},
		[refresh],
	);

	const rateListingNote = useCallback(
		(id: string, note: string) => {
			setListings((prev) =>
				prev.map((l) => (l.id === id ? { ...l, userRatingNote: note } : l)),
			);
			const listing = listings.find((l) => l.id === id);
			if (listing?.userRating) {
				void appRpc.request
					.rateListing({
						id,
						rating: listing.userRating as 1 | 2 | 3 | 4 | 5,
						note,
					})
					.catch(() => refresh());
			}
		},
		[listings, refresh],
	);

	// ─── Optimistic archive ────────────────────────────────────────────
	const archiveListing = useCallback(
		(id: string) => {
			setListings((prev) => prev.filter((l) => l.id !== id));
			setTotal((t) => Math.max(0, t - 1));
			void appRpc.request.archiveListing({ id }).catch(() => {
				refresh();
			});
		},
		[refresh],
	);

	// ─── Run pipeline ──────────────────────────────────────────────────
	const runPipeline = useCallback(() => {
		setPipelineRunning(true);
		setPipelineStatus(null);
		setPipelineStats(null);
		void appRpc.request.runPipeline().catch((err) => {
			setError(err instanceof Error ? err.message : String(err));
			setPipelineRunning(false);
		});
	}, []);

	// ─── Message listeners ─────────────────────────────────────────────
	useEffect(() => {
		const handleListingsUpdated = () => {
			// Re-fetch current filter when new listings arrive
			void fetchListings(filterRef.current, 0, false);
		};

		const handlePipelineStatus = (payload: {
			runId: string;
			status: string;
			stats?: PipelineRunStats;
		}) => {
			setPipelineStatus(payload.status);
			if (payload.stats) {
				setPipelineStats(payload.stats);
			}
			if (payload.status === "completed" || payload.status === "failed") {
				setPipelineRunning(false);
			}
		};

		appRpc.addMessageListener("listingsUpdated", handleListingsUpdated);
		appRpc.addMessageListener("pipelineStatus", handlePipelineStatus);

		return () => {
			appRpc.removeMessageListener("listingsUpdated", handleListingsUpdated);
			appRpc.removeMessageListener("pipelineStatus", handlePipelineStatus);
		};
	}, [fetchListings]);

	const hasMore = listings.length < total;

	return {
		listings,
		total,
		loading,
		loadingMore,
		hasMore,
		error,
		activeFilter,
		setFilter,
		loadMore,
		refresh,
		rateListing,
		rateListingNote,
		archiveListing,
		runPipeline,
		pipelineRunning,
		pipelineStatus,
		pipelineStats,
	};
}
