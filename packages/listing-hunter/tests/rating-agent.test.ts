import { describe, expect, test } from "bun:test";
import type { BaseListing } from "../src/types/index.js";
import { rateListing } from "../src/bun/rating-agent.js";

const SKIP = !process.env.ANTHROPIC_API_KEY;

function makeListing(id: string): BaseListing {
	return {
		id,
		sourceId: id,
		sourceName: "trademe",
		sourceUrl: `https://example.com/listing/${id}`,
		title: "Sunny 2-bedroom apartment",
		description:
			"Bright top-floor unit with lots of natural light and close to parks.",
		images: ["https://example.com/image.jpg"],
		discoveredAt: new Date(),
		aiRating: null,
		aiRatingReason: null,
		userRating: null,
		userRatingNote: null,
		archived: false,
	};
}

describe.skipIf(SKIP)("Rating agent (integration)", () => {
	test(
		"rates a listing when preference profile exists",
		async () => {
			const result = await rateListing(
				makeListing("rating-1"),
				"Prefers bright 2-bedroom homes near parks under $700/week.",
				null,
			);

			expect(result).not.toBeNull();
			expect(result!.rating).toBeGreaterThanOrEqual(1);
			expect(result!.rating).toBeLessThanOrEqual(5);
			expect(result!.reason.trim().length).toBeGreaterThan(0);
		},
		120_000,
	);

	test(
		"returns null when no preference profile is provided",
		async () => {
			const result = await rateListing(makeListing("rating-2"), null, null);
			expect(result).toBeNull();
		},
		120_000,
	);

	test(
		"includes calibration log context and succeeds",
		async () => {
			const result = await rateListing(
				makeListing("rating-3"),
				"Prefers quiet areas and natural light.",
				"Avoid overrating listings that are dark or near heavy traffic.",
			);

			expect(result).not.toBeNull();
			expect(result!.rating).toBeGreaterThanOrEqual(1);
			expect(result!.rating).toBeLessThanOrEqual(5);
			expect(result!.reason.trim().length).toBeGreaterThan(0);
		},
		120_000,
	);
});
