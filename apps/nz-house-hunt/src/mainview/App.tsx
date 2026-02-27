import { useEffect, useState } from "react";
import {
	FeedHeader,
	ListingFeed,
	PipelineStatusBar,
} from "@cortex/listing-hunter/react";
import { Button } from "@cortex/core-ui";
import { appRpc } from "./rpc";
import { useFeedState } from "./use-feed-state";
import { RentalListingFields } from "./RentalListingFields";
import { InterviewView } from "./InterviewView";

type View = "feed" | "interview";

export default function App() {
	const [view, setView] = useState<View>("feed");
	const [profileExists, setProfileExists] = useState<boolean | null>(null);
	const feedState = useFeedState();

	// Check for preference profile on mount
	useEffect(() => {
		void appRpc.request.hasPreferenceProfile().then(({ exists }) => {
			setProfileExists(exists);
			if (!exists) {
				setView("interview");
			}
		});
	}, []);

	// ─── Interview view ────────────────────────────────────────────────
	if (view === "interview") {
		return (
			<div className="flex h-full flex-col bg-background">
				<header className="flex h-11 shrink-0 items-center justify-between border-b px-4">
					<h1 className="text-sm font-semibold">Preferences</h1>
					{profileExists && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => setView("feed")}
						>
							Back to listings
						</Button>
					)}
				</header>
				<InterviewView
					onDone={() => {
						setProfileExists(true);
						setView("feed");
					}}
				/>
			</div>
		);
	}

	// ─── Feed view ─────────────────────────────────────────────────────
	return (
		<div className="flex h-full flex-col bg-background">
			<FeedHeader
				title="NZ House Hunt"
				subtitle="Rental listings"
				onPreferences={() => setView("interview")}
				onRefresh={feedState.refresh}
				refreshing={feedState.loading}
				pipelineSlot={
					<PipelineStatusBar
						running={feedState.pipelineRunning}
						statusText={feedState.pipelineStatus ?? undefined}
						stats={feedState.pipelineStats}
						onRunPipeline={feedState.runPipeline}
						disabled={feedState.pipelineRunning}
					/>
				}
			/>

			{/* Warning: no preference profile */}
			{!profileExists && profileExists !== null && (
				<div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
					No preference profile set.{" "}
					<button
						type="button"
						className="underline"
						onClick={() => setView("interview")}
					>
						Set up your preferences
					</button>{" "}
					to enable AI-powered discovery and rating.
				</div>
			)}

			{/* Error banner */}
			{feedState.error && (
				<div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
					{feedState.error}
				</div>
			)}

			<ListingFeed
				listings={feedState.listings}
				total={feedState.total}
				loading={feedState.loading}
				activeFilter={feedState.activeFilter}
				onFilterChange={feedState.setFilter}
				onLoadMore={feedState.loadMore}
				hasMore={feedState.hasMore}
				loadingMore={feedState.loadingMore}
				onRate={feedState.rateListing}
				onRateNote={feedState.rateListingNote}
				onArchive={feedState.archiveListing}
				renderFields={(listing) => (
					<RentalListingFields listing={listing} />
				)}
			/>
		</div>
	);
}
