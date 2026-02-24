import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { baseListingSchema } from "../src/types/index.js";
import { createListingHunter } from "../src/bun/listing-hunter.js";

const rentalSchema = baseListingSchema.extend({
	weeklyRent: z.number(),
	bedrooms: z.number(),
	suburb: z.string(),
});

type RentalListing = z.infer<typeof rentalSchema>;

function createTestHunter() {
	const root = mkdtempSync(join(tmpdir(), "listing-hunter-test-"));
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
		sourceName: "trademe",
		sourceUrl: "https://trademe.co.nz/listing/123",
		title: "Nice house in Ponsonby",
		description: "A lovely 3-bedroom home",
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

describe("ListingRepository", () => {
	test("insert and retrieve by id with extended fields", () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			const listing = makeListing();
			hunter.listings.insert(listing);

			const result = hunter.listings.getById(listing.id);
			expect(result).not.toBeNull();
			expect(result!.id).toBe(listing.id);
			expect(result!.title).toBe("Nice house in Ponsonby");
			expect(result!.weeklyRent).toBe(750);
			expect(result!.bedrooms).toBe(3);
			expect(result!.suburb).toBe("Ponsonby");
			expect(result!.images).toEqual(["https://example.com/img1.jpg"]);
			expect(result!.discoveredAt).toBeInstanceOf(Date);
		} finally {
			cleanup();
		}
	});

	test("query with 'new' filter returns unrated, non-archived listings", () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			hunter.listings.insert(makeListing({ id: "a", sourceId: "1" }));
			hunter.listings.insert(makeListing({ id: "b", sourceId: "2", userRating: 3 }));
			hunter.listings.insert(makeListing({ id: "c", sourceId: "3", archived: true }));

			const result = hunter.listings.query("new");
			expect(result.total).toBe(1);
			expect(result.listings[0].id).toBe("a");
		} finally {
			cleanup();
		}
	});

	test("query with 'shortlist' filter returns highly rated listings", () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			hunter.listings.insert(makeListing({ id: "a", sourceId: "1", userRating: 5 }));
			hunter.listings.insert(makeListing({ id: "b", sourceId: "2", userRating: 4 }));
			hunter.listings.insert(makeListing({ id: "c", sourceId: "3", userRating: 2 }));
			hunter.listings.insert(makeListing({ id: "d", sourceId: "4" }));

			const result = hunter.listings.query("shortlist");
			expect(result.total).toBe(2);
		} finally {
			cleanup();
		}
	});

	test("query with 'archived' filter returns only archived", () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			hunter.listings.insert(makeListing({ id: "a", sourceId: "1" }));
			hunter.listings.insert(makeListing({ id: "b", sourceId: "2", archived: true }));

			const result = hunter.listings.query("archived");
			expect(result.total).toBe(1);
			expect(result.listings[0].id).toBe("b");
		} finally {
			cleanup();
		}
	});

	test("query with 'all' filter returns everything", () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			hunter.listings.insert(makeListing({ id: "a", sourceId: "1" }));
			hunter.listings.insert(makeListing({ id: "b", sourceId: "2", archived: true }));
			hunter.listings.insert(makeListing({ id: "c", sourceId: "3", userRating: 5 }));

			const result = hunter.listings.query("all");
			expect(result.total).toBe(3);
		} finally {
			cleanup();
		}
	});

	test("updateRating sets user rating and note", () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			const listing = makeListing();
			hunter.listings.insert(listing);

			const updated = hunter.listings.updateRating(listing.id, 4, "Great location");
			expect(updated).not.toBeNull();
			expect(updated!.userRating).toBe(4);
			expect(updated!.userRatingNote).toBe("Great location");
		} finally {
			cleanup();
		}
	});

	test("archive sets archived flag", () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			const listing = makeListing();
			hunter.listings.insert(listing);

			hunter.listings.archive(listing.id);
			const result = hunter.listings.getById(listing.id);
			expect(result!.archived).toBe(true);
		} finally {
			cleanup();
		}
	});

	test("existsBySourceKey detects duplicates", () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			const listing = makeListing({ sourceId: "abc", sourceName: "trademe" });
			hunter.listings.insert(listing);

			expect(hunter.listings.existsBySourceKey("trademe", "abc")).toBe(true);
			expect(hunter.listings.existsBySourceKey("trademe", "xyz")).toBe(false);
			expect(hunter.listings.existsBySourceKey("other", "abc")).toBe(false);
		} finally {
			cleanup();
		}
	});

	test("dedup by source key enforced by unique constraint", () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			hunter.listings.insert(makeListing({ id: "a", sourceId: "1", sourceName: "trademe" }));
			expect(() => {
				hunter.listings.insert(makeListing({ id: "b", sourceId: "1", sourceName: "trademe" }));
			}).toThrow();
		} finally {
			cleanup();
		}
	});
});
