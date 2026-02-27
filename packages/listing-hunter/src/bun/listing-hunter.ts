import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { z, ZodObject, ZodRawShape } from "zod";
import type { BaseListing } from "../types/index.js";
import { ensureSchema } from "./migrate.js";
import {
	createListingRepository,
	type ListingRepository,
} from "./listing-repository.js";
import {
	createDocumentRepository,
	type DocumentRepository,
} from "./document-repository.js";
import {
	createSourceCursorRepository,
	type SourceCursorRepository,
} from "./source-cursor-repository.js";
import {
	createPipelineRunRepository,
	type PipelineRunRepository,
} from "./pipeline-run-repository.js";
import {
	createRatingOverrideRepository,
	type RatingOverrideRepository,
} from "./rating-override-repository.js";
import { runPipeline, type PipelineRunResult, type HydrateFn } from "./pipeline.js";
import type { SourceTools, ExtractFn } from "./discovery-agent.js";
import { rateListing, type RateFn } from "./rating-agent.js";
import { synthesizeCalibration, type CalibrateFn } from "./calibration-agent.js";

const CALIBRATION_THRESHOLD = 5;

export interface ListingHunterOptions<T extends BaseListing> {
	schema: z.ZodType<T>;
	dbPath: string;
	sourceTools?: SourceTools;
	sourceName?: string;
	extract?: ExtractFn;
	hydrate?: HydrateFn<T>;
	rate?: RateFn<T>;
	calibrate?: CalibrateFn;
}

export interface ListingHunter<T extends BaseListing> {
	listings: ListingRepository<T>;
	documents: DocumentRepository;
	sourceCursors: SourceCursorRepository;
	pipelineRuns: PipelineRunRepository;
	ratingOverrides: RatingOverrideRepository;
	runPipeline(): Promise<PipelineRunResult>;
	rateUnrated(): Promise<{ rated: number; failed: number }>;
	rateListing(
		id: string,
		userRating: number,
		userNote?: string,
	): Promise<{ listing: T; calibrationTriggered: boolean }>;
	runCalibration(): Promise<void>;
	close(): void;
}

export function createListingHunter<T extends BaseListing>(
	options: ListingHunterOptions<T>,
): ListingHunter<T> {
	mkdirSync(dirname(options.dbPath), { recursive: true });

	const sqlite = new Database(options.dbPath, { create: true, strict: true });
	sqlite.exec("PRAGMA journal_mode = WAL");
	ensureSchema(sqlite);

	const db = drizzle(sqlite);

	const repos = {
		listings: createListingRepository<T>(db, options.schema),
		documents: createDocumentRepository(db),
		sourceCursors: createSourceCursorRepository(db),
		pipelineRuns: createPipelineRunRepository(db),
		ratingOverrides: createRatingOverrideRepository(db),
	};

	const rate = options.rate ?? (rateListing as RateFn<T>);
	const calibrate = options.calibrate ?? synthesizeCalibration;
	let calibrationInFlight: Promise<void> | null = null;

	const runCalibrationInternal = async () => {
		const overrides = repos.ratingOverrides.getAll();
		if (overrides.length === 0) {
			return;
		}

		const calibrationDoc = repos.documents.get("calibration_log");
		const preferenceDoc = repos.documents.get("preference_profile");

		const synthesized = await calibrate(
			overrides,
			calibrationDoc?.content ?? null,
			preferenceDoc?.content ?? null,
		);

		repos.documents.set("calibration_log", synthesized);
	};

	const ensureCalibrationRunning = (): Promise<void> => {
		if (calibrationInFlight) {
			return calibrationInFlight;
		}

		calibrationInFlight = runCalibrationInternal().finally(() => {
			calibrationInFlight = null;
		});
		return calibrationInFlight;
	};

	const hunter: ListingHunter<T> = {
		...repos,
		async runPipeline() {
			if (!options.sourceTools || !options.sourceName) {
				throw new Error(
					"Cannot run pipeline: sourceTools and sourceName are required. Pass them to createListingHunter().",
				);
			}
			return runPipeline<T>({
				schema: options.schema as unknown as ZodObject<ZodRawShape>,
				sourceTools: options.sourceTools,
				sourceName: options.sourceName,
				listings: repos.listings,
				pipelineRuns: repos.pipelineRuns,
				documents: repos.documents,
				extract: options.extract,
				hydrate: options.hydrate,
				rate,
			});
		},
		async rateUnrated() {
			const prefDoc = repos.documents.get("preference_profile");
			const preferenceProfile = prefDoc?.content ?? null;
			if (!preferenceProfile) {
				console.log("[listing-hunter] rateUnrated: no preference profile, skipping");
				return { rated: 0, failed: 0 };
			}

			const calibrationDoc = repos.documents.get("calibration_log");
			const calibrationLog = calibrationDoc?.content ?? null;

			const unrated = repos.listings.queryUnrated();
			if (unrated.length === 0) {
				return { rated: 0, failed: 0 };
			}

			console.log(`[listing-hunter] rateUnrated: ${unrated.length} listings to rate`);
			let rated = 0;
			let failed = 0;

			const CONCURRENCY = 10;
			let index = 0;
			async function worker() {
				while (index < unrated.length) {
					const listing = unrated[index++];
					try {
						const result = await rate(listing, preferenceProfile, calibrationLog);
						if (result) {
							repos.listings.updateAiRating(listing.id, result.rating, result.reason);
							rated++;
						}
					} catch (err) {
						failed++;
						console.error(`[listing-hunter] rateUnrated failed for ${listing.sourceId}:`, err instanceof Error ? err.message : String(err));
					}
				}
			}
			await Promise.all(Array.from({ length: Math.min(CONCURRENCY, unrated.length) }, () => worker()));

			console.log(`[listing-hunter] rateUnrated complete: ${rated} rated, ${failed} failed`);
			return { rated, failed };
		},
		async rateListing(id, userRating, userNote) {
			const existing = repos.listings.getById(id);
			if (!existing) {
				throw new Error(`Listing not found: ${id}`);
			}

			const listing = repos.listings.updateRating(id, userRating, userNote);
			if (!listing) {
				throw new Error(`Listing not found after rating update: ${id}`);
			}

			let calibrationTriggered = false;
			if (existing.aiRating !== null && existing.aiRating !== userRating) {
				repos.ratingOverrides.insert({
					id: crypto.randomUUID(),
					listingId: id,
					aiRating: existing.aiRating,
					userRating,
					userNote: userNote ?? null,
				});

				const calibrationDoc = repos.documents.get("calibration_log");
					const overrideCount = repos.ratingOverrides.countSince(
						calibrationDoc?.updatedAt ?? null,
					);

					if (
						overrideCount >= CALIBRATION_THRESHOLD &&
						calibrationInFlight === null
					) {
						calibrationTriggered = true;
						void ensureCalibrationRunning().catch((err: unknown) => {
							console.error("Calibration failed", err);
						});
					}
				}

				return { listing, calibrationTriggered };
			},
			async runCalibration() {
				await ensureCalibrationRunning();
			},
		close() {
			sqlite.close();
		},
	};

	return hunter;
}
