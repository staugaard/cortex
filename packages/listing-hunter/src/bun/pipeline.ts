import type { ZodObject, ZodRawShape } from "zod";
import type { BaseListing, PipelineRunStats } from "../types/index.js";
import type { ListingRepository } from "./listing-repository.js";
import type { PipelineRunRepository } from "./pipeline-run-repository.js";
import type { DocumentRepository } from "./document-repository.js";
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
}

export interface PipelineRunResult {
	runId: string;
	stats: PipelineRunStats;
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

		// 4. Store — insert new listings (no rating in Phase 2)
		let inserted = 0;
		for (const listing of newListings) {
			try {
				config.listings.insert(listing);
				inserted++;
			} catch {
				// Unique constraint violation from concurrent/duplicate sourceIds in batch
				duplicates++;
			}
		}

		// 5. Complete pipeline run
		const stats: PipelineRunStats = {
			discovered,
			duplicates,
			new: inserted,
			rated: 0,
		};

		config.pipelineRuns.complete(runId, stats);

		return { runId, stats };
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		config.pipelineRuns.fail(runId, errorMessage);
		throw err;
	}
}
