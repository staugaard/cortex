import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { baseListingSchema } from "../src/types/index.js";
import { createListingHunter } from "../src/bun/listing-hunter.js";
import { runPipeline, type DiscoverFn, type EnrichFn } from "../src/bun/pipeline.js";
import type { DiscoveryAgentOptions, DiscoveryResult } from "../src/bun/discovery-agent.js";
import type { RateFn, RatingResult } from "../src/bun/rating-agent.js";

const rentalSchema = baseListingSchema.extend({
	weeklyRent: z.number(),
	bedrooms: z.number(),
	suburb: z.string(),
});

type RentalListing = z.infer<typeof rentalSchema>;

function createTestHunter() {
	const root = mkdtempSync(join(tmpdir(), "pipeline-test-"));
	const dbPath = join(root, "test.sqlite");
	const hunter = createListingHunter<RentalListing>({
		schema: rentalSchema,
		dbPath,
	});
	return {
		hunter,
		cleanup: () => {
			hunter.close();
			rmSync(root, { recursive: true, force: true });
		},
	};
}

function makeListing(overrides: Partial<RentalListing> = {}): RentalListing {
	return {
		id: crypto.randomUUID(),
		sourceId: "123",
		sourceName: "test",
		sourceUrl: "https://example.com/listing/123",
		title: "Nice house",
		description: "A lovely home",
		images: ["https://example.com/img1.jpg"],
		discoveredAt: new Date(),
		aiRating: null,
		aiRatingReason: null,
		userRating: null,
		userRatingNote: null,
		archived: false,
		weeklyRent: 750,
		bedrooms: 3,
		suburb: "Ponsonby",
		...overrides,
	};
}

function createMockDiscover(
	listings: RentalListing[],
): DiscoverFn<RentalListing> {
	return async (_options: DiscoveryAgentOptions): Promise<DiscoveryResult<RentalListing>> => ({
		listings,
		toolCallCount: 1,
		stepsUsed: 1,
	});
}

function createFailingDiscover(): DiscoverFn<RentalListing> {
	return async () => {
		throw new Error("Discovery agent exploded");
	};
}

function createMockRate(
	result: RatingResult = { rating: 4, reason: "Good match" },
): RateFn<RentalListing> {
	return async () => result;
}

function createFailingRate(): RateFn<RentalListing> {
	return async () => {
		throw new Error("Rating agent exploded");
	};
}

describe("Pipeline", () => {
	test("discovers, filters, and stores new listings", async () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			const listings = [
				makeListing({ sourceId: "new-1" }),
				makeListing({ sourceId: "new-2" }),
				makeListing({ sourceId: "new-3" }),
			];

			const result = await runPipeline({
				schema: rentalSchema,
				sourceTools: {},
				sourceName: "test",
				listings: hunter.listings,
				pipelineRuns: hunter.pipelineRuns,
				documents: hunter.documents,
				discover: createMockDiscover(listings),
				rate: createMockRate(),
			});

			expect(result.stats.discovered).toBe(3);
			expect(result.stats.duplicates).toBe(0);
			expect(result.stats.new).toBe(3);
			expect(result.stats.rated).toBe(3);

			// Verify all listings are in the database
			const stored = hunter.listings.query("all");
			expect(stored.total).toBe(3);
		} finally {
			cleanup();
		}
	});

	test("filters out duplicate listings", async () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			// Pre-insert a listing
			hunter.listings.insert(
				makeListing({ sourceId: "existing-1", sourceName: "test" }),
			);

			const listings = [
				makeListing({ sourceId: "existing-1", sourceName: "test" }),
				makeListing({ sourceId: "new-1", sourceName: "test" }),
				makeListing({ sourceId: "new-2", sourceName: "test" }),
			];

			const result = await runPipeline({
				schema: rentalSchema,
				sourceTools: {},
				sourceName: "test",
				listings: hunter.listings,
				pipelineRuns: hunter.pipelineRuns,
				documents: hunter.documents,
				discover: createMockDiscover(listings),
				rate: createMockRate(),
			});

			expect(result.stats.discovered).toBe(3);
			expect(result.stats.duplicates).toBe(1);
			expect(result.stats.new).toBe(2);
			expect(result.stats.rated).toBe(2);

			// Verify 3 total (1 pre-existing + 2 new)
			const stored = hunter.listings.query("all");
			expect(stored.total).toBe(3);
		} finally {
			cleanup();
		}
	});

	test("running pipeline twice does not create duplicates", async () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			const listings = [
				makeListing({ sourceId: "a", sourceName: "test" }),
				makeListing({ sourceId: "b", sourceName: "test" }),
			];

			// First run
			const result1 = await runPipeline({
				schema: rentalSchema,
				sourceTools: {},
				sourceName: "test",
				listings: hunter.listings,
				pipelineRuns: hunter.pipelineRuns,
				documents: hunter.documents,
				discover: createMockDiscover(listings),
				rate: createMockRate(),
			});

			expect(result1.stats.new).toBe(2);
			expect(result1.stats.duplicates).toBe(0);
			expect(result1.stats.rated).toBe(2);

			// Second run with same listings
			const result2 = await runPipeline({
				schema: rentalSchema,
				sourceTools: {},
				sourceName: "test",
				listings: hunter.listings,
				pipelineRuns: hunter.pipelineRuns,
				documents: hunter.documents,
				discover: createMockDiscover(listings),
				rate: createMockRate(),
			});

			expect(result2.stats.discovered).toBe(2);
			expect(result2.stats.duplicates).toBe(2);
			expect(result2.stats.new).toBe(0);
			expect(result2.stats.rated).toBe(0);

			// Still only 2 in the database
			const stored = hunter.listings.query("all");
			expect(stored.total).toBe(2);
		} finally {
			cleanup();
			}
		});

	test("counts duplicate rows from unique constraint collisions inside one batch", async () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			const listings = [
				makeListing({ id: "a", sourceId: "dup-1", sourceName: "test" }),
				makeListing({ id: "b", sourceId: "dup-1", sourceName: "test" }),
			];

			const result = await runPipeline({
				schema: rentalSchema,
				sourceTools: {},
				sourceName: "test",
				listings: hunter.listings,
				pipelineRuns: hunter.pipelineRuns,
				documents: hunter.documents,
				discover: createMockDiscover(listings),
				rate: createMockRate(),
			});

			expect(result.stats.discovered).toBe(2);
			expect(result.stats.new).toBe(1);
			expect(result.stats.duplicates).toBe(1);
		} finally {
			cleanup();
		}
	});

	test("tracks pipeline run on success", async () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			const result = await runPipeline({
				schema: rentalSchema,
				sourceTools: {},
				sourceName: "test",
				listings: hunter.listings,
				pipelineRuns: hunter.pipelineRuns,
				documents: hunter.documents,
				discover: createMockDiscover([makeListing({ sourceId: "a" })]),
				rate: createMockRate(),
			});

			const latest = hunter.pipelineRuns.getLatest();
			expect(latest).not.toBeNull();
			expect(latest!.id).toBe(result.runId);
			expect(latest!.status).toBe("completed");
			expect(latest!.stats.discovered).toBe(1);
			expect(latest!.stats.new).toBe(1);
			expect(latest!.stats.rated).toBe(1);
			expect(latest!.completedAt).not.toBeNull();
			expect(latest!.error).toBeNull();
		} finally {
			cleanup();
		}
	});

	test("tracks pipeline run on failure", async () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			await expect(
				runPipeline({
					schema: rentalSchema,
					sourceTools: {},
					sourceName: "test",
					listings: hunter.listings,
					pipelineRuns: hunter.pipelineRuns,
					documents: hunter.documents,
					discover: createFailingDiscover(),
					rate: createMockRate(),
				}),
			).rejects.toThrow("Discovery agent exploded");

			const latest = hunter.pipelineRuns.getLatest();
			expect(latest).not.toBeNull();
			expect(latest!.status).toBe("failed");
			expect(latest!.error).toBe("Discovery agent exploded");
		} finally {
			cleanup();
		}
	});

	test("includes preference profile when available", async () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			// Set a preference profile
			hunter.documents.set(
				"preference_profile",
				"Looking for 3-bedroom houses under $800/week in Ponsonby",
			);

			let capturedOptions: DiscoveryAgentOptions | null = null;
			const capturingDiscover: DiscoverFn<RentalListing> = async (options) => {
				capturedOptions = options;
				return { listings: [], toolCallCount: 0, stepsUsed: 0 };
			};

			await runPipeline({
				schema: rentalSchema,
				sourceTools: {},
				sourceName: "test",
				listings: hunter.listings,
				pipelineRuns: hunter.pipelineRuns,
				documents: hunter.documents,
				discover: capturingDiscover,
				rate: createMockRate(),
			});

			expect(capturedOptions).not.toBeNull();
			expect(capturedOptions!.preferenceProfile).toBe(
				"Looking for 3-bedroom houses under $800/week in Ponsonby",
			);
		} finally {
			cleanup();
		}
	});

	test("handles empty discovery result", async () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			const result = await runPipeline({
				schema: rentalSchema,
				sourceTools: {},
				sourceName: "test",
				listings: hunter.listings,
				pipelineRuns: hunter.pipelineRuns,
				documents: hunter.documents,
				discover: createMockDiscover([]),
				rate: createMockRate(),
			});

			expect(result.stats.discovered).toBe(0);
			expect(result.stats.duplicates).toBe(0);
			expect(result.stats.new).toBe(0);
			expect(result.stats.rated).toBe(0);

			const latest = hunter.pipelineRuns.getLatest();
			expect(latest!.status).toBe("completed");
		} finally {
			cleanup();
		}
	});

	test("rates new listings before storing", async () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			const listing = makeListing({ sourceId: "rated-1" });

			await runPipeline({
				schema: rentalSchema,
				sourceTools: {},
				sourceName: "test",
				listings: hunter.listings,
				pipelineRuns: hunter.pipelineRuns,
				documents: hunter.documents,
				discover: createMockDiscover([listing]),
				rate: createMockRate({ rating: 5, reason: "Excellent match" }),
			});

			const stored = hunter.listings.getById(listing.id);
			expect(stored).not.toBeNull();
			expect(stored!.aiRating).toBe(5);
			expect(stored!.aiRatingReason).toBe("Excellent match");
		} finally {
			cleanup();
		}
	});

	test("stats.rated reflects successful ratings", async () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			const result = await runPipeline({
				schema: rentalSchema,
				sourceTools: {},
				sourceName: "test",
				listings: hunter.listings,
				pipelineRuns: hunter.pipelineRuns,
				documents: hunter.documents,
				discover: createMockDiscover([
					makeListing({ sourceId: "rated-1" }),
					makeListing({ sourceId: "rated-2" }),
				]),
				rate: createMockRate(),
			});

			expect(result.stats.rated).toBe(2);
		} finally {
			cleanup();
		}
	});

	test("rating failure does not prevent listing storage", async () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			const listing = makeListing({ sourceId: "rate-fail-1" });

			const result = await runPipeline({
				schema: rentalSchema,
				sourceTools: {},
				sourceName: "test",
				listings: hunter.listings,
				pipelineRuns: hunter.pipelineRuns,
				documents: hunter.documents,
				discover: createMockDiscover([listing]),
				rate: createFailingRate(),
			});

			expect(result.stats.new).toBe(1);
			expect(result.stats.rated).toBe(0);

			const stored = hunter.listings.getById(listing.id);
			expect(stored).not.toBeNull();
			expect(stored!.aiRating).toBeNull();
			expect(stored!.aiRatingReason).toBeNull();
		} finally {
			cleanup();
			}
		});

	test("fails the pipeline on non-duplicate insert errors", async () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			const listing = makeListing({ sourceId: "insert-fail-1" });
			const failingListings = {
				...hunter.listings,
				insert: () => {
					throw new Error("Disk I/O error");
				},
			};

			await expect(
				runPipeline({
					schema: rentalSchema,
					sourceTools: {},
					sourceName: "test",
					listings: failingListings,
					pipelineRuns: hunter.pipelineRuns,
					documents: hunter.documents,
					discover: createMockDiscover([listing]),
					rate: createMockRate(),
				}),
			).rejects.toThrow("Disk I/O error");

			const latest = hunter.pipelineRuns.getLatest();
			expect(latest).not.toBeNull();
			expect(latest!.status).toBe("failed");
			expect(latest!.error).toBe("Disk I/O error");
		} finally {
			cleanup();
		}
	});

	test("enrichment merges data into listings", async () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			const listing = makeListing({ sourceId: "enrich-1" });

			const mockEnrich: EnrichFn<RentalListing> = async () => ({
				suburb: "Enriched Suburb",
			});

			const result = await runPipeline({
				schema: rentalSchema,
				sourceTools: {},
				sourceName: "test",
				listings: hunter.listings,
				pipelineRuns: hunter.pipelineRuns,
				documents: hunter.documents,
				discover: createMockDiscover([listing]),
				enrich: mockEnrich,
				enrichmentPrompt: "Enrich this listing",
				rate: createMockRate(),
			});

			expect(result.stats.enriched).toBe(1);

			const stored = hunter.listings.getById(listing.id);
			expect(stored).not.toBeNull();
			expect(stored!.suburb).toBe("Enriched Suburb");
		} finally {
			cleanup();
		}
	});

	test("enrichment failure is non-fatal — listings still stored and rated", async () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			const listing = makeListing({ sourceId: "enrich-fail-1" });

			const failingEnrich: EnrichFn<RentalListing> = async () => {
				throw new Error("Enrichment agent exploded");
			};

			const result = await runPipeline({
				schema: rentalSchema,
				sourceTools: {},
				sourceName: "test",
				listings: hunter.listings,
				pipelineRuns: hunter.pipelineRuns,
				documents: hunter.documents,
				discover: createMockDiscover([listing]),
				enrich: failingEnrich,
				enrichmentPrompt: "Enrich this listing",
				rate: createMockRate(),
			});

			expect(result.stats.enriched).toBe(0);
			expect(result.stats.new).toBe(1);
			expect(result.stats.rated).toBe(1);

			const stored = hunter.listings.getById(listing.id);
			expect(stored).not.toBeNull();
		} finally {
			cleanup();
		}
	});

	test("enrichment receives correct args: listing, prompt, and preference profile", async () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			hunter.documents.set(
				"preference_profile",
				"Commutes to Newmarket by bus",
			);

			const listing = makeListing({ sourceId: "enrich-args-1" });
			let capturedListing: RentalListing | null = null;
			let capturedPrompt: string | null = null;
			let capturedProfile: string | null = null;

			const capturingEnrich: EnrichFn<RentalListing> = async (l, prompt, profile) => {
				capturedListing = l as RentalListing;
				capturedPrompt = prompt;
				capturedProfile = profile;
				return null;
			};

			await runPipeline({
				schema: rentalSchema,
				sourceTools: {},
				sourceName: "test",
				listings: hunter.listings,
				pipelineRuns: hunter.pipelineRuns,
				documents: hunter.documents,
				discover: createMockDiscover([listing]),
				enrich: capturingEnrich,
				enrichmentPrompt: "Add commute data",
				rate: createMockRate(),
			});

			expect(capturedListing).not.toBeNull();
			expect(capturedListing!.sourceId).toBe("enrich-args-1");
			expect(capturedPrompt).toBe("Add commute data");
			expect(capturedProfile).toBe("Commutes to Newmarket by bus");
		} finally {
			cleanup();
		}
	});

	test("self-heal enriches unenriched listings and re-rates them", async () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			// Pre-insert a listing without enrichment (simulates a failed enrichment run)
			hunter.listings.insert(
				makeListing({ sourceId: "unenriched-1", sourceName: "test", aiRating: 3, aiRatingReason: "OK" }),
			);

			hunter.documents.set("preference_profile", "Likes Ponsonby");

			let enrichCallCount = 0;
			const mockEnrich: EnrichFn<RentalListing> = async () => {
				enrichCallCount++;
				return { suburb: "Enriched Ponsonby" };
			};

			let rateCallCount = 0;
			const mockRate: RateFn<RentalListing> = async () => {
				rateCallCount++;
				return { rating: 5, reason: "Great after enrichment" };
			};

			// Run pipeline with no new discoveries — should trigger self-heal
			const result = await runPipeline({
				schema: rentalSchema,
				sourceTools: {},
				sourceName: "test",
				listings: hunter.listings,
				pipelineRuns: hunter.pipelineRuns,
				documents: hunter.documents,
				discover: createMockDiscover([]),
				enrich: mockEnrich,
				enrichmentPrompt: "Enrich this listing",
				rate: mockRate,
			});

			expect(result.stats.backfilledEnrichment).toBe(1);
			expect(result.stats.reRated).toBe(1);
			expect(enrichCallCount).toBe(1);
			// rate is called once for re-rating the backfilled listing
			expect(rateCallCount).toBeGreaterThanOrEqual(1);

			// Verify the listing was updated in the DB
			const stored = hunter.listings.query("all");
			expect(stored.listings[0].suburb).toBe("Enriched Ponsonby");
			expect(stored.listings[0].aiRating).toBe(5);
			expect(stored.listings[0].aiRatingReason).toBe("Great after enrichment");
		} finally {
			cleanup();
		}
	});

	test("self-heal enrichment failure is non-fatal", async () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			hunter.listings.insert(
				makeListing({ sourceId: "unenriched-fail-1", sourceName: "test" }),
			);

			const failingEnrich: EnrichFn<RentalListing> = async () => {
				throw new Error("Enrichment service down");
			};

			// Should complete without throwing
			const result = await runPipeline({
				schema: rentalSchema,
				sourceTools: {},
				sourceName: "test",
				listings: hunter.listings,
				pipelineRuns: hunter.pipelineRuns,
				documents: hunter.documents,
				discover: createMockDiscover([]),
				enrich: failingEnrich,
				enrichmentPrompt: "Enrich this listing",
				rate: createMockRate(),
			});

			expect(result.stats.backfilledEnrichment).toBe(0);
			expect(result.stats.reRated).toBe(0);

			// Listing should still be unenriched (will be retried next run)
			const unenriched = hunter.listings.queryUnenriched();
			expect(unenriched.length).toBe(1);
		} finally {
			cleanup();
		}
	});

	test("newly enriched listings get enrichedAt set via markEnriched", async () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			const listing = makeListing({ sourceId: "mark-enriched-1" });

			const mockEnrich: EnrichFn<RentalListing> = async () => ({
				suburb: "Enriched",
			});

			await runPipeline({
				schema: rentalSchema,
				sourceTools: {},
				sourceName: "test",
				listings: hunter.listings,
				pipelineRuns: hunter.pipelineRuns,
				documents: hunter.documents,
				discover: createMockDiscover([listing]),
				enrich: mockEnrich,
				enrichmentPrompt: "Enrich",
				rate: createMockRate(),
			});

			// After enrichment + insert + markEnriched, the listing should NOT appear as unenriched
			const unenriched = hunter.listings.queryUnenriched();
			expect(unenriched.length).toBe(0);
		} finally {
			cleanup();
		}
	});

	test("passes preference profile and calibration log to rate function", async () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			hunter.documents.set(
				"preference_profile",
				"Looking for sunny places near parks",
			);
			hunter.documents.set(
				"calibration_log",
				"User prefers natural light more than large floor area.",
			);

			let capturedPreference: string | null = null;
			let capturedCalibration: string | null = null;
			const capturingRate: RateFn<RentalListing> = async (
				_listing,
				preferenceProfile,
				calibrationLog,
			) => {
				capturedPreference = preferenceProfile;
				capturedCalibration = calibrationLog;
				return { rating: 4, reason: "Good match" };
			};

			await runPipeline({
				schema: rentalSchema,
				sourceTools: {},
				sourceName: "test",
				listings: hunter.listings,
				pipelineRuns: hunter.pipelineRuns,
				documents: hunter.documents,
				discover: createMockDiscover([makeListing({ sourceId: "ctx-1" })]),
				rate: capturingRate,
			});

			expect(capturedPreference).toBe(
				"Looking for sunny places near parks",
			);
			expect(capturedCalibration).toBe(
				"User prefers natural light more than large floor area.",
			);
		} finally {
			cleanup();
		}
	});
});
