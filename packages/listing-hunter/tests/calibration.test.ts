import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baseListingSchema, type BaseListing } from "../src/types/index.js";
import { createListingHunter } from "../src/bun/listing-hunter.js";
import type { CalibrateFn } from "../src/bun/calibration-agent.js";

function createTestHunter(calibrate?: CalibrateFn) {
	const root = mkdtempSync(join(tmpdir(), "listing-hunter-calibration-test-"));
	const dbPath = join(root, "test.sqlite");
	const hunter = createListingHunter<BaseListing>({
		schema: baseListingSchema,
		dbPath,
		calibrate,
	});
	return {
		hunter,
		cleanup: () => {
			hunter.close();
			rmSync(root, { recursive: true, force: true });
		},
	};
}

function makeListing(id: string, aiRating: number | null): BaseListing {
	return {
		id,
		sourceId: id,
		sourceName: "test",
		sourceUrl: `https://example.com/${id}`,
		title: "Test listing",
		description: "Description",
		images: ["https://example.com/image.jpg"],
		discoveredAt: new Date(),
		aiRating,
		aiRatingReason: aiRating === null ? null : "AI guess",
		userRating: null,
		userRatingNote: null,
		archived: false,
	};
}

async function waitFor(
	condition: () => boolean,
	timeoutMs = 2_000,
): Promise<void> {
	const start = Date.now();
	while (!condition()) {
		if (Date.now() - start > timeoutMs) {
			throw new Error("Timed out waiting for condition");
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
}

describe("ListingHunter calibration behavior", () => {
	test("records override when user rating differs from ai rating", async () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			hunter.listings.insert(makeListing("listing-1", 3));

			const result = await hunter.rateListing("listing-1", 5, "Much better");

			expect(result.calibrationTriggered).toBe(false);
			expect(result.listing.userRating).toBe(5);

			const overrides = hunter.ratingOverrides.getByListingId("listing-1");
			expect(overrides.length).toBe(1);
			expect(overrides[0].aiRating).toBe(3);
			expect(overrides[0].userRating).toBe(5);
			expect(overrides[0].userNote).toBe("Much better");
		} finally {
			cleanup();
		}
	});

	test("does not record override when user agrees with ai rating", async () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			hunter.listings.insert(makeListing("listing-1", 4));

			const result = await hunter.rateListing("listing-1", 4, "Agree");

			expect(result.calibrationTriggered).toBe(false);
			expect(hunter.ratingOverrides.getByListingId("listing-1")).toEqual([]);
		} finally {
			cleanup();
		}
	});

	test("does not record override when ai rating is null", async () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			hunter.listings.insert(makeListing("listing-1", null));

			const result = await hunter.rateListing("listing-1", 5, "Like it");

			expect(result.calibrationTriggered).toBe(false);
			expect(hunter.ratingOverrides.getByListingId("listing-1")).toEqual([]);
		} finally {
			cleanup();
		}
	});

	test("rejects invalid user ratings", async () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			hunter.listings.insert(makeListing("listing-1", 3));

			await expect(hunter.rateListing("listing-1", 9)).rejects.toThrow(
				"userRating must be an integer between 1 and 5",
			);

			const listing = hunter.listings.getById("listing-1");
			expect(listing).not.toBeNull();
			expect(listing!.userRating).toBeNull();
			expect(hunter.ratingOverrides.getByListingId("listing-1")).toEqual([]);
		} finally {
			cleanup();
		}
	});

	test("triggers calibration after 5 overrides", async () => {
		let calibrationRuns = 0;
		const calibrate: CalibrateFn = async () => {
			calibrationRuns++;
			return "Updated calibration";
		};

		const { hunter, cleanup } = createTestHunter(calibrate);
		try {
			for (let i = 1; i <= 5; i++) {
				hunter.listings.insert(makeListing(`listing-${i}`, 2));
			}

			for (let i = 1; i <= 4; i++) {
				const result = await hunter.rateListing(`listing-${i}`, 5);
				expect(result.calibrationTriggered).toBe(false);
			}

			const fifth = await hunter.rateListing("listing-5", 5);
			expect(fifth.calibrationTriggered).toBe(true);

			await waitFor(() => calibrationRuns > 0);
			const calibrationDoc = hunter.documents.get("calibration_log");
			expect(calibrationDoc).not.toBeNull();
			expect(calibrationDoc!.content).toBe("Updated calibration");
		} finally {
			cleanup();
		}
	});

	test("does not trigger calibration before threshold", async () => {
		let calibrationRuns = 0;
		const calibrate: CalibrateFn = async () => {
			calibrationRuns++;
			return "Should not run";
		};

		const { hunter, cleanup } = createTestHunter(calibrate);
		try {
			for (let i = 1; i <= 4; i++) {
				hunter.listings.insert(makeListing(`listing-${i}`, 2));
			}

			for (let i = 1; i <= 4; i++) {
				const result = await hunter.rateListing(`listing-${i}`, 5);
				expect(result.calibrationTriggered).toBe(false);
			}

			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(calibrationRuns).toBe(0);
		} finally {
			cleanup();
			}
		});

	test("does not start a second calibration while one is already running", async () => {
		let calibrationRuns = 0;
		let releaseCalibration: (() => void) | null = null;

		const calibrate: CalibrateFn = async () => {
			calibrationRuns++;
			await new Promise<void>((resolve) => {
				releaseCalibration = resolve;
			});
			return "Updated calibration";
		};

		const { hunter, cleanup } = createTestHunter(calibrate);
		try {
			for (let i = 1; i <= 6; i++) {
				hunter.listings.insert(makeListing(`listing-${i}`, 2));
			}

			for (let i = 1; i <= 4; i++) {
				const result = await hunter.rateListing(`listing-${i}`, 5);
				expect(result.calibrationTriggered).toBe(false);
			}

			const fifth = await hunter.rateListing("listing-5", 5);
			expect(fifth.calibrationTriggered).toBe(true);
			await waitFor(() => calibrationRuns === 1);

			const sixth = await hunter.rateListing("listing-6", 5);
			expect(sixth.calibrationTriggered).toBe(false);
			expect(calibrationRuns).toBe(1);

			if (!releaseCalibration) {
				throw new Error("Expected calibration run to be in progress");
			}
			releaseCalibration();

			await waitFor(
				() => hunter.documents.get("calibration_log")?.content === "Updated calibration",
			);
		} finally {
			cleanup();
		}
	});
});
