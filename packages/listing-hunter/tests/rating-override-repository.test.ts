import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baseListingSchema } from "../src/types/index.js";
import { createListingHunter } from "../src/bun/listing-hunter.js";
import type { BaseListing } from "../src/types/index.js";

function createTestHunter() {
	const root = mkdtempSync(join(tmpdir(), "listing-hunter-test-"));
	const dbPath = join(root, "test.sqlite");
	const hunter = createListingHunter({
		schema: baseListingSchema,
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

function makeListing(id: string): BaseListing {
	return {
		id,
		sourceId: id,
		sourceName: "test",
		sourceUrl: `https://example.com/${id}`,
		title: "Test listing",
		description: "Description",
		images: ["https://example.com/img.jpg"],
		discoveredAt: new Date(),
		aiRating: 3,
		aiRatingReason: "Decent",
		userRating: null,
		userRatingNote: null,
		archived: false,
	};
}

describe("RatingOverrideRepository", () => {
	test("insert and query by listing id", () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			hunter.listings.insert(makeListing("listing-1"));
			hunter.ratingOverrides.insert({
				id: "override-1",
				listingId: "listing-1",
				aiRating: 3,
				userRating: 5,
				userNote: "Actually great",
			});

			const overrides = hunter.ratingOverrides.getByListingId("listing-1");
			expect(overrides.length).toBe(1);
			expect(overrides[0].aiRating).toBe(3);
			expect(overrides[0].userRating).toBe(5);
			expect(overrides[0].userNote).toBe("Actually great");
		} finally {
			cleanup();
		}
	});

	test("returns empty array for listing with no overrides", () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			expect(hunter.ratingOverrides.getByListingId("nonexistent")).toEqual([]);
		} finally {
			cleanup();
		}
	});

	test("getAll returns overrides ordered by createdAt desc", () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			hunter.listings.insert(makeListing("listing-1"));
			hunter.listings.insert(makeListing("listing-2"));

			hunter.ratingOverrides.insert({
				id: "override-1",
				listingId: "listing-1",
				aiRating: 2,
				userRating: 4,
				userNote: "Better than predicted",
			});
			hunter.ratingOverrides.insert({
				id: "override-2",
				listingId: "listing-2",
				aiRating: 4,
				userRating: 2,
				userNote: "Worse than predicted",
			});

			const all = hunter.ratingOverrides.getAll();
			expect(all.length).toBe(2);
			expect(all[0].createdAt >= all[1].createdAt).toBe(true);
		} finally {
			cleanup();
		}
	});

	test("countSince counts only overrides after the provided timestamp", async () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			hunter.listings.insert(makeListing("listing-1"));
			hunter.listings.insert(makeListing("listing-2"));

			hunter.ratingOverrides.insert({
				id: "override-1",
				listingId: "listing-1",
				aiRating: 2,
				userRating: 4,
				userNote: null,
			});

			const marker = new Date().toISOString();
			await new Promise((resolve) => setTimeout(resolve, 20));

			hunter.ratingOverrides.insert({
				id: "override-2",
				listingId: "listing-2",
				aiRating: 1,
				userRating: 5,
				userNote: null,
			});

			expect(hunter.ratingOverrides.countSince(null)).toBe(2);
			expect(hunter.ratingOverrides.countSince(marker)).toBe(1);
		} finally {
			cleanup();
		}
	});
});
