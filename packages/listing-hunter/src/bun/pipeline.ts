import type { ZodObject, ZodRawShape } from "zod";
import type { BaseListing, PipelineRunStats } from "../types/index.js";
import type { ListingRepository } from "./listing-repository.js";
import type { PipelineRunRepository } from "./pipeline-run-repository.js";
import type { DocumentRepository } from "./document-repository.js";
import { rateListing, type RateFn } from "./rating-agent.js";
import {
	runDiscovery,
	type SourceTools,
	type DiscoveryAgentOptions,
	type DiscoveryResult,
} from "./discovery-agent.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type DiscoverFn<T extends BaseListing> = (
	options: DiscoveryAgentOptions,
) => Promise<DiscoveryResult<T>>;

export interface PipelineConfig<T extends BaseListing> {
	schema: ZodObject<ZodRawShape>;
	sourceTools: SourceTools;
	sourceName: string;
	listings: ListingRepository<T>;
	pipelineRuns: PipelineRunRepository;
	documents: DocumentRepository;
	discover?: DiscoverFn<T>;
	rate?: RateFn<T>;
}

export interface PipelineRunResult {
	runId: string;
	stats: PipelineRunStats;
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

		// 2. Discover — AI agent searches sources and extracts listings
		const discover: DiscoverFn<T> = config.discover ?? runDiscovery;
		const discoveryResult = await discover({
			sourceTools: config.sourceTools,
			schema: config.schema,
			preferenceProfile,
			sourceName: config.sourceName,
		});

		const discovered = discoveryResult.listings.length;

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

		// 4. Rate — score new listings before insert (non-fatal)
		const calibrationDoc = config.documents.get("calibration_log");
		const calibrationLog = calibrationDoc?.content ?? null;
		const rate: RateFn<T> = config.rate ?? rateListing;

		let rated = 0;
		for (const listing of newListings) {
			try {
				const result = await rate(listing, preferenceProfile, calibrationLog);
				if (result) {
					listing.aiRating = result.rating;
					listing.aiRatingReason = result.reason;
					rated++;
				}
			} catch (err) {
				console.error("Failed to rate listing", {
					sourceName: listing.sourceName,
					sourceId: listing.sourceId,
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}

		// 5. Store — insert new listings
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

		// 6. Complete pipeline run
		const stats: PipelineRunStats = {
			discovered,
			duplicates,
			new: inserted,
			rated,
		};

		config.pipelineRuns.complete(runId, stats);

		return { runId, stats };
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		config.pipelineRuns.fail(runId, errorMessage);
		throw err;
	}
}
