import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { BaseListing } from "../types/index.js";

export type RatingResult = {
	rating: number;
	reason: string;
};

export type RateFn<T extends BaseListing = BaseListing> = (
	listing: T,
	preferenceProfile: string | null,
	calibrationLog: string | null,
) => Promise<RatingResult | null>;

const RATING_MODEL_ID = "claude-sonnet-4-6";

const ratingSchema = z.object({
	rating: z
		.number()
		.describe("Rating from 1 (terrible fit) to 5 (excellent fit)"),
	reason: z.string(),
});

const SYSTEM_MANAGED_KEYS = new Set<string>([
	"id",
	"discoveredAt",
	"aiRating",
	"aiRatingReason",
	"userRating",
	"userRatingNote",
	"archived",
]);

function serializeListingForRating(
	listing: BaseListing,
): Record<string, unknown> {
	const serialized: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(listing)) {
		if (SYSTEM_MANAGED_KEYS.has(key)) continue;
		serialized[key] = value instanceof Date ? value.toISOString() : value;
	}

	return serialized;
}

function buildSystemPrompt(
	preferenceProfile: string,
	calibrationLog: string | null,
): string {
	return [
		"You are a listing relevance rater.",
		"Rate listings from 1 to 5 against the user's stated preferences and calibration notes.",
		"",
		"Rating scale:",
		"1 = terrible fit,",
		"2 = weak fit,",
		"3 = acceptable fit,",
		"4 = strong fit,",
		"5 = excellent fit.",
		"",
		"Return a brief reason tied to concrete listing details.",
		"",
		"## Preference profile",
		preferenceProfile,
		"",
		"## Calibration log",
		calibrationLog?.trim().length
			? calibrationLog
			: "No calibration log yet. Use only the preference profile.",
	].join("\n");
}

export const rateListing: RateFn = async (
	listing,
	preferenceProfile,
	calibrationLog,
) => {
	const normalizedPreferences = preferenceProfile?.trim();
	if (!normalizedPreferences) return null;

	const result = await generateText({
		model: anthropic(RATING_MODEL_ID),
		output: Output.object({ schema: ratingSchema }),
		system: buildSystemPrompt(normalizedPreferences, calibrationLog),
		prompt: `Rate this listing JSON:\n${JSON.stringify(serializeListingForRating(listing), null, 2)}`,
	});

	const output = result.experimental_output;
	if (!output) {
		throw new Error("Rating agent returned no structured output");
	}

	const reason = output.reason.trim();
	if (reason.length === 0) {
		throw new Error("Rating agent returned an empty reason");
	}

	return { rating: output.rating, reason };
};
