import type { ZodObject, ZodRawShape } from "zod";
import type { BaseListing, PipelineRunStats } from "../types/index.js";
import type { ListingRepository } from "./listing-repository.js";
import type { PipelineRunRepository } from "./pipeline-run-repository.js";
import type { DocumentRepository } from "./document-repository.js";
import { rateListing, type RateFn } from "./rating-agent.js";
import {
	runDiscovery,
	type SourceTools,
	type ExtractFn,
	type DiscoveryAgentOptions,
	type DiscoveryResult,
} from "./discovery-agent.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type DiscoverFn<T extends BaseListing> = (
	options: DiscoveryAgentOptions,
) => Promise<DiscoveryResult<T>>;

export type HydrateFn<T extends BaseListing> = (
	listing: T,
) => Promise<Partial<T> | null>;

export interface PipelineConfig<T extends BaseListing> {
	schema: ZodObject<ZodRawShape>;
	sourceTools: SourceTools;
	sourceName: string;
	listings: ListingRepository<T>;
	pipelineRuns: PipelineRunRepository;
	documents: DocumentRepository;
	discover?: DiscoverFn<T>;
	extract?: ExtractFn;
	hydrate?: HydrateFn<T>;
	rate?: RateFn<T>;
}

export interface PipelineRunResult {
	runId: string;
	stats: PipelineRunStats;
}

const RATING_CONCURRENCY = 10;

/** Run an async function over items with bounded concurrency. */
async function mapConcurrent<T, R>(
	items: T[],
	concurrency: number,
	fn: (item: T) => Promise<R>,
): Promise<R[]> {
	const results: R[] = [];
	let index = 0;

	async function worker() {
		while (index < items.length) {
			const i = index++;
			results[i] = await fn(items[i]);
		}
	}

	await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
	return results;
}

function isUniqueConstraintError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	const message = error.message.toLowerCase();
	return (
		message.includes("sqlite_constraint_unique") ||
		message.includes("unique constraint failed")
	);
}

// ─── Pipeline ───────────────────────────────────────────────────────────────

export async function runPipeline<T extends BaseListing>(
	config: PipelineConfig<T>,
): Promise<PipelineRunResult> {
	const runId = crypto.randomUUID();
	config.pipelineRuns.create(runId);

	try {
		// 1. Load preference profile (may be null if interview hasn't happened)
		const prefDoc = config.documents.get("preference_profile");
		const preferenceProfile = prefDoc?.content ?? null;
		console.log(`[pipeline] run=${runId.slice(0, 8)} started (source=${config.sourceName}, hasPrefs=${!!preferenceProfile})`);

		// 2. Discover — AI agent searches sources and extracts listings
		const discover: DiscoverFn<T> = config.discover ?? runDiscovery;
		const discoveryResult = await discover({
			sourceTools: config.sourceTools,
			schema: config.schema,
			preferenceProfile,
			sourceName: config.sourceName,
			extract: config.extract,
		});

		const discovered = discoveryResult.listings.length;
		console.log(`[pipeline] discovery complete: ${discovered} listings found (${discoveryResult.stepsUsed} steps, ${discoveryResult.toolCallCount} tool calls)`);

		// 3. Filter — skip listings already in the database
		const newListings: T[] = [];
		let duplicates = 0;

		for (const listing of discoveryResult.listings) {
			if (
				config.listings.existsBySourceKey(
					listing.sourceName,
					listing.sourceId,
				)
			) {
				duplicates++;
			} else {
				newListings.push(listing);
			}
		}
		console.log(`[pipeline] filter: ${newListings.length} new, ${duplicates} duplicates`);

		// 4. Hydrate — fetch additional detail for new listings (non-fatal)
		if (config.hydrate && newListings.length > 0) {
			const HYDRATE_CONCURRENCY = 5;
			console.log(`[pipeline] hydrating ${newListings.length} new listings (concurrency=${HYDRATE_CONCURRENCY})...`);
			let hydrated = 0;
			let hydrateFailed = 0;
			await mapConcurrent(newListings, HYDRATE_CONCURRENCY, async (listing) => {
				try {
					const extra = await config.hydrate!(listing);
					if (extra) {
						Object.assign(listing, extra);
						hydrated++;
					}
				} catch (err) {
					hydrateFailed++;
					console.error(`[pipeline] hydrate failed (${hydrateFailed}): ${listing.sourceId}: ${err instanceof Error ? err.message : String(err)}`);
				}
			});
			console.log(`[pipeline] hydrate done: ${hydrated} hydrated, ${hydrateFailed} failed`);
		}

		// 5. Rate — score new listings before insert (non-fatal)
		const calibrationDoc = config.documents.get("calibration_log");
		const calibrationLog = calibrationDoc?.content ?? null;
		const rate: RateFn<T> = config.rate ?? rateListing;

		let rated = 0;
		let ratingsFailed = 0;
		if (newListings.length > 0) {
			console.log(`[pipeline] rating ${newListings.length} new listings (concurrency=${RATING_CONCURRENCY})...`);
		}
		await mapConcurrent(newListings, RATING_CONCURRENCY, async (listing) => {
			try {
				const result = await rate(listing, preferenceProfile, calibrationLog);
				if (result) {
					listing.aiRating = result.rating;
					listing.aiRatingReason = result.reason;
					rated++;
					console.log(`[pipeline] rated ${rated}/${newListings.length}: ${listing.sourceId} → ${result.rating}/5`);
				}
			} catch (err) {
				ratingsFailed++;
				console.error(`[pipeline] rating failed (${ratingsFailed}): ${listing.sourceId}: ${err instanceof Error ? err.message : String(err)}`);
			}
		});
		if (newListings.length > 0) {
			console.log(`[pipeline] rating done: ${rated} rated, ${ratingsFailed} failed`);
		}

		// 6. Store — insert new listings
		let inserted = 0;
			for (const listing of newListings) {
				try {
					config.listings.insert(listing);
					inserted++;
				} catch (err) {
					if (isUniqueConstraintError(err)) {
						// Expected when the same listing appears multiple times in a batch
						// or is inserted concurrently by another pipeline run.
						duplicates++;
						continue;
					}
					throw err;
				}
			}

		// 7. Self-heal — rate any previously unrated listings (from earlier failed runs)
		if (preferenceProfile) {
			const unrated = config.listings.queryUnrated();
			if (unrated.length > 0) {
				console.log(`[pipeline] self-heal: ${unrated.length} unrated listings found, rating (concurrency=${RATING_CONCURRENCY})...`);
				let healed = 0;
				let healFailed = 0;
				await mapConcurrent(unrated, RATING_CONCURRENCY, async (listing) => {
					try {
						const result = await rate(listing, preferenceProfile, calibrationLog);
						if (result) {
							config.listings.updateAiRating(listing.id, result.rating, result.reason);
							rated++;
							healed++;
							console.log(`[pipeline] self-heal rated ${healed}/${unrated.length}: ${listing.sourceId} → ${result.rating}/5`);
						}
					} catch (err) {
						healFailed++;
						console.error(`[pipeline] self-heal failed (${healFailed}): ${listing.sourceId}: ${err instanceof Error ? err.message : String(err)}`);
					}
				});
				console.log(`[pipeline] self-heal done: ${healed} rated, ${healFailed} failed`);
			}
		}

		// 8. Complete pipeline run
		const stats: PipelineRunStats = {
			discovered,
			duplicates,
			new: inserted,
			rated,
		};

		config.pipelineRuns.complete(runId, stats);

		console.log(`[pipeline] run=${runId.slice(0, 8)} complete:`, stats);
		return { runId, stats };
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		config.pipelineRuns.fail(runId, errorMessage);
		console.error(`[pipeline] run=${runId.slice(0, 8)} FAILED:`, errorMessage);
		throw err;
	}
}
