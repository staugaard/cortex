import { useCallback, useEffect, useState } from "react";
import { appRpc } from "./rpc";
import { InterviewView } from "./InterviewView";

type View = "feed" | "interview";

type Listing = Awaited<
	ReturnType<typeof appRpc.request.getListings>
>["listings"][number];

export default function App() {
	const [view, setView] = useState<View>("feed");
	const [profileExists, setProfileExists] = useState<boolean | null>(null);
	const [listings, setListings] = useState<Listing[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [runningPipeline, setRunningPipeline] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [lastRunId, setLastRunId] = useState<string | null>(null);

	useEffect(() => {
		void appRpc.request.hasPreferenceProfile().then(({ exists }) => {
			setProfileExists(exists);
			if (!exists) {
				setView("interview");
			}
		});
	}, []);

	const loadListings = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const response = await appRpc.request.getListings({
				filter: "all",
				limit: 50,
				offset: 0,
			});
			setListings(response.listings);
			setTotal(response.total);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, []);

	const runPipeline = useCallback(async () => {
		setRunningPipeline(true);
		setError(null);
		try {
			const { runId } = await appRpc.request.runPipeline();
			setLastRunId(runId);
			await loadListings();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setRunningPipeline(false);
		}
	}, [loadListings]);

	useEffect(() => {
		void loadListings();
	}, [loadListings]);

	if (view === "interview") {
		return (
			<div className="flex h-full flex-col">
				<header className="flex shrink-0 items-center justify-between border-b px-6 py-3">
					<h1 className="text-lg font-semibold">Preferences</h1>
					{profileExists && (
						<button
							type="button"
							className="rounded-md border px-3 py-1.5 text-sm"
							onClick={() => setView("feed")}
						>
							Back to listings
						</button>
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

	return (
		<div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4 p-6">
			<header className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-xl font-semibold">NZ House Hunt</h1>
					<p className="text-sm text-muted-foreground">
						{loading ? "Loading listings..." : `${total} listings`}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						className="rounded-md border px-3 py-2 text-sm"
						onClick={() => setView("interview")}
					>
						Preferences
					</button>
					<button
						type="button"
						className="rounded-md border px-3 py-2 text-sm"
						onClick={() => void loadListings()}
						disabled={loading || runningPipeline}
					>
						Refresh
					</button>
					<button
						type="button"
						className="rounded-md bg-foreground px-3 py-2 text-sm text-background"
						onClick={() => void runPipeline()}
						disabled={runningPipeline}
					>
						{runningPipeline ? "Running..." : "Run Pipeline"}
					</button>
				</div>
			</header>

			{!profileExists && profileExists !== null ? (
				<div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-700">
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
			) : null}

			{lastRunId ? (
				<p className="text-xs text-muted-foreground">Last run id: {lastRunId}</p>
			) : null}
			{error ? (
				<p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
					{error}
				</p>
			) : null}

			<section className="grid gap-3 overflow-auto pb-4">
				{!loading && listings.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No listings yet. Run the pipeline to discover listings.
					</p>
				) : null}
				{listings.map((listing) => (
					<article key={listing.id} className="rounded-md border p-3">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<h2 className="font-medium">{listing.title}</h2>
							<span className="text-xs text-muted-foreground">
								{listing.userRating ?? "-"} user | {listing.aiRating ?? "-"} ai
							</span>
						</div>
						<p className="mt-1 text-sm text-muted-foreground">{listing.sourceUrl}</p>
						<p className="mt-2 text-sm">
							{listing.suburb} · {listing.bedrooms} bed · ${listing.weeklyRent}/wk
						</p>
						<p className="mt-2 text-xs text-muted-foreground">
							Discovered{" "}
							{new Date(listing.discoveredAt as unknown as string).toLocaleString()}
						</p>
					</article>
				))}
			</section>
		</div>
	);
}
