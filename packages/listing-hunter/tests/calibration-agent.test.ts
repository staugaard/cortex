import { describe, expect, test } from "bun:test";
import type { RatingOverrideRecord } from "../src/bun/rating-override-repository.js";
import { synthesizeCalibration } from "../src/bun/calibration-agent.js";

const SKIP = !process.env.ANTHROPIC_API_KEY;

function makeOverrides(): RatingOverrideRecord[] {
	return [
		{
			id: "override-3",
			listingId: "listing-3",
			aiRating: 4,
			userRating: 2,
			userNote: "Too noisy at night",
			createdAt: new Date().toISOString(),
		},
		{
			id: "override-2",
			listingId: "listing-2",
			aiRating: 2,
			userRating: 5,
			userNote: "Great natural light and close to park",
			createdAt: new Date(Date.now() - 60_000).toISOString(),
		},
		{
			id: "override-1",
			listingId: "listing-1",
			aiRating: 3,
			userRating: 5,
			userNote: "Loved the outdoor space",
			createdAt: new Date(Date.now() - 120_000).toISOString(),
		},
	];
}

describe.skipIf(SKIP)("Calibration agent (integration)", () => {
	test(
		"produces a non-empty calibration log",
		async () => {
			const result = await synthesizeCalibration(
				makeOverrides(),
				null,
				"Prefers bright, quiet homes with nearby green space.",
			);

			expect(result.trim().length).toBeGreaterThan(0);
		},
		120_000,
	);

	test(
		"updates an existing calibration log with new overrides",
		async () => {
			const existingLog = [
				"Prioritize natural light heavily.",
				"Downweight listings near noisy roads.",
			].join("\n");

			const result = await synthesizeCalibration(
				makeOverrides(),
				existingLog,
				"Prefers bright, quiet homes with nearby green space.",
			);

			expect(result.trim().length).toBeGreaterThan(0);
		},
		120_000,
	);
});
