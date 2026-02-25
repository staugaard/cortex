import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { baseListingSchema } from "../src/types/index.js";
import { createListingHunter } from "../src/bun/listing-hunter.js";
import { runPipeline, type DiscoverFn } from "../src/bun/pipeline.js";
import type { DiscoveryAgentOptions, DiscoveryResult } from "../src/bun/discovery-agent.js";

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
			});

			expect(result.stats.discovered).toBe(3);
			expect(result.stats.duplicates).toBe(0);
			expect(result.stats.new).toBe(3);
			expect(result.stats.rated).toBe(0);

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
			});

			expect(result.stats.discovered).toBe(3);
			expect(result.stats.duplicates).toBe(1);
			expect(result.stats.new).toBe(2);

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
			});

			expect(result1.stats.new).toBe(2);
			expect(result1.stats.duplicates).toBe(0);

			// Second run with same listings
			const result2 = await runPipeline({
				schema: rentalSchema,
				sourceTools: {},
				sourceName: "test",
				listings: hunter.listings,
				pipelineRuns: hunter.pipelineRuns,
				documents: hunter.documents,
				discover: createMockDiscover(listings),
			});

			expect(result2.stats.discovered).toBe(2);
			expect(result2.stats.duplicates).toBe(2);
			expect(result2.stats.new).toBe(0);

			// Still only 2 in the database
			const stored = hunter.listings.query("all");
			expect(stored.total).toBe(2);
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
			});

			const latest = hunter.pipelineRuns.getLatest();
			expect(latest).not.toBeNull();
			expect(latest!.id).toBe(result.runId);
			expect(latest!.status).toBe("completed");
			expect(latest!.stats.discovered).toBe(1);
			expect(latest!.stats.new).toBe(1);
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
			});

			expect(result.stats.discovered).toBe(0);
			expect(result.stats.duplicates).toBe(0);
			expect(result.stats.new).toBe(0);

			const latest = hunter.pipelineRuns.getLatest();
			expect(latest!.status).toBe("completed");
		} finally {
			cleanup();
		}
	});
});
