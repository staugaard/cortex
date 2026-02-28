import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { ToolLoopAgent } from "ai";
import { baseListingSchema } from "../src/types/index.js";
import { createListingHunter } from "../src/bun/listing-hunter.js";
import { createInterviewAgent } from "../src/bun/interview-agent.js";

const rentalSchema = baseListingSchema.extend({
	weeklyRent: z.number(),
	bedrooms: z.number(),
	bathrooms: z.number(),
	suburb: z.string(),
	propertyType: z.string(),
	parkingSpaces: z.number().nullable(),
	petFriendly: z.boolean().nullable(),
	availableFrom: z.coerce.date().nullable(),
});

function createTestHunter() {
	const root = mkdtempSync(join(tmpdir(), "listing-hunter-interview-test-"));
	const dbPath = join(root, "test.sqlite");
	const hunter = createListingHunter({
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

describe("createInterviewAgent", () => {
	test("returns a ToolLoopAgent with save_preference_profile tool", () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			const agent = createInterviewAgent({
				schema: rentalSchema,
				documents: hunter.documents,
			});
			expect(agent).toBeInstanceOf(ToolLoopAgent);
			expect(agent.tools).toHaveProperty("save_preference_profile");
		} finally {
			cleanup();
		}
	});
});

const SKIP = !process.env.ANTHROPIC_API_KEY;

describe.skipIf(SKIP)("Interview agent (integration)", () => {
	test(
		"agent calls save_preference_profile and persists document",
		async () => {
			const { hunter, cleanup } = createTestHunter();
			try {
				const agent = createInterviewAgent({
					schema: rentalSchema,
					documents: hunter.documents,
				});

				// Simulate a user providing clear preferences in one message
				const result = await agent.stream({
					prompt: [
						{
							role: "user",
							content:
								"I'm looking for a 3-bedroom house in Ponsonby or Grey Lynn, budget around $800/week. Must be pet-friendly with at least one parking space. I'd prefer a standalone house but a townhouse is fine too.",
						},
					],
				});

				// Consume the stream to completion
				for await (const _chunk of result.textStream) {
					// drain
				}

				const profile = hunter.documents.get("preference_profile");
				expect(profile).not.toBeNull();
				expect(profile!.content.length).toBeGreaterThan(0);
			} finally {
				cleanup();
			}
		},
		120_000,
	);

	test(
		"agent sees existing profile in system prompt",
		async () => {
			const { hunter, cleanup } = createTestHunter();
			try {
				// Set an existing profile
				hunter.documents.set(
					"preference_profile",
					"Looking for 2-bedroom apartments in CBD under $600/week.",
				);

				const agent = createInterviewAgent({
					schema: rentalSchema,
					documents: hunter.documents,
				});

				// Ask to update preferences
				const result = await agent.stream({
					prompt: [
						{
							role: "user",
							content:
								"I've changed my mind — I now want 3 bedrooms and I'm willing to go up to $900/week. Everything else stays the same.",
						},
					],
				});

				for await (const _chunk of result.textStream) {
					// drain
				}

				const profile = hunter.documents.get("preference_profile");
				expect(profile).not.toBeNull();
				// Updated profile should reference the higher budget or bedroom count
				expect(profile!.content.length).toBeGreaterThan(0);
			} finally {
				cleanup();
			}
		},
		120_000,
	);
});
