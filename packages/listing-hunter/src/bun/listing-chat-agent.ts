import { ToolLoopAgent, tool, zodSchema } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { BaseListing } from "../types/index.js";
import type { ListingRepository } from "./listing-repository.js";
import type { DocumentRepository } from "./document-repository.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ListingChatAgentOptions<T extends BaseListing> {
	listings: ListingRepository<T>;
	documents: DocumentRepository;
	rateListing: (
		id: string,
		rating: number,
		note?: string,
	) => Promise<{ listing: T; calibrationTriggered: boolean }>;
	/** Map a listing to compact fields for the frontloaded index. */
	serializeCompact: (listing: T) => Record<string, unknown>;
	/** Map a listing to full fields for the get_listing_details tool. */
	serializeFull: (listing: T) => Record<string, unknown>;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const LISTING_CHAT_MODEL_ID = "claude-sonnet-4-6";

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildCompactIndex<T extends BaseListing>(
	listings: ListingRepository<T>,
	serializeCompact: (listing: T) => Record<string, unknown>,
): { index: string; count: number } {
	const { listings: all } = listings.query("all", "rating", 1000);
	const active = all.filter((l) => !l.archived);
	const index = active.map((l) => JSON.stringify(serializeCompact(l))).join("\n");
	return { index, count: active.length };
}

function extractSnippet(text: string, query: string, contextChars = 100): string {
	const lower = text.toLowerCase();
	const idx = lower.indexOf(query.toLowerCase());
	if (idx === -1) return text.slice(0, contextChars * 2);
	const start = Math.max(0, idx - contextChars);
	const end = Math.min(text.length, idx + query.length + contextChars);
	const prefix = start > 0 ? "..." : "";
	const suffix = end < text.length ? "..." : "";
	return prefix + text.slice(start, end) + suffix;
}

function buildListingChatSystemPrompt(options: {
	compactIndex: string;
	count: number;
	preferenceProfile: string | null;
	calibrationLog: string | null;
}): string {
	const parts: string[] = [
		"You are a listing search assistant helping the user explore, compare, and evaluate listings.",
		"You have a compact index of ALL active listings loaded below.",
		"Use this index to answer questions, compare options, and make recommendations without tool calls.",
		"",
		"## Guidelines",
		"1. Most queries can be answered directly from the index — only use tools when you need data not in the index (descriptions, images, source URLs).",
		"2. When comparing listings, present key tradeoffs clearly.",
		"3. When the user expresses new preferences, update their preference profile.",
		"4. Format listing references as **title** (suburb, $rent/wk) for clarity.",
		"5. Keep responses concise and scannable. Use tables or bullet lists for comparisons.",
		"6. When rating or archiving, confirm the action to the user.",
	];

	if (options.preferenceProfile) {
		parts.push(
			"",
			"## Preference Profile",
			options.preferenceProfile,
		);
	}

	if (options.calibrationLog) {
		parts.push(
			"",
			"## Calibration Log",
			options.calibrationLog,
		);
	}

	parts.push(
		"",
		`## Listing Index (${options.count} active listings)`,
		"Each line is a JSON object with key fields. Use get_listing_details for full data.",
		options.compactIndex,
	);

	return parts.join("\n");
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createListingChatAgent<T extends BaseListing>(
	options: ListingChatAgentOptions<T>,
) {
	const { index, count } = buildCompactIndex(options.listings, options.serializeCompact);
	const preferenceProfile = options.documents.get("preference_profile")?.content ?? null;
	const calibrationLog = options.documents.get("calibration_log")?.content ?? null;

	return new ToolLoopAgent({
		model: anthropic(LISTING_CHAT_MODEL_ID),
		instructions: buildListingChatSystemPrompt({
			compactIndex: index,
			count,
			preferenceProfile,
			calibrationLog,
		}),
		tools: {
			get_listing_details: tool<
				{ ids: string[] },
				{ listings: Record<string, unknown>[] }
			>({
				description:
					"Get full details for one or more listings by ID. " +
					"Use when you need descriptions, images, source URLs, or other fields not in the compact index.",
				inputSchema: zodSchema(
					z.object({
						ids: z
							.array(z.string())
							.min(1)
							.max(10)
							.describe("Listing IDs to fetch (max 10)"),
					}),
				),
				execute: async ({ ids }) => {
					const results = ids
						.map((id) => options.listings.getById(id))
						.filter((l): l is T => l !== null)
						.map((l) => options.serializeFull(l));
					return { listings: results };
				},
			}),

			search_descriptions: tool<
				{ query: string },
				{ matches: { id: string; title: string; snippet: string }[]; totalMatches: number }
			>({
				description:
					"Search listing titles and descriptions for keywords. " +
					"Use when the user asks about features mentioned in descriptions but not captured in the compact index (e.g. 'garden', 'heat pump', 'renovated').",
				inputSchema: zodSchema(
					z.object({
						query: z.string().describe("Keywords to search for"),
					}),
				),
				execute: async ({ query }) => {
					const { listings: all } = options.listings.query("all", "rating", 500);
					const q = query.toLowerCase();
					const matches = all
						.filter(
							(l) =>
								!l.archived &&
								(l.title.toLowerCase().includes(q) ||
									l.description.toLowerCase().includes(q)),
						)
						.slice(0, 20)
						.map((l) => ({
							id: l.id,
							title: l.title,
							snippet: extractSnippet(l.description, query),
						}));
					return { matches, totalMatches: matches.length };
				},
			}),

			update_preference_profile: tool<
				{ content: string },
				{ saved: boolean }
			>({
				description:
					"Update the user's preference profile based on new information from the conversation. " +
					"Provide the complete updated profile (not a diff).",
				inputSchema: zodSchema(
					z.object({
						content: z
							.string()
							.describe("The complete updated preference profile document"),
					}),
				),
				execute: async ({ content }) => {
					options.documents.set("preference_profile", content);
					return { saved: true };
				},
			}),

			archive_listings: tool<
				{ ids: string[] },
				{ archived: number }
			>({
				description:
					"Archive listings the user wants to dismiss from their feed.",
				inputSchema: zodSchema(
					z.object({
						ids: z
							.array(z.string())
							.min(1)
							.max(20)
							.describe("Listing IDs to archive"),
					}),
				),
				execute: async ({ ids }) => {
					for (const id of ids) {
						options.listings.archive(id);
					}
					return { archived: ids.length };
				},
			}),

			rate_listing: tool<
				{ id: string; rating: number; note?: string },
				{ success: boolean; calibrationTriggered: boolean }
			>({
				description:
					"Set the user's rating for a listing (1-5 stars). " +
					"Use when the user expresses a clear preference about a specific listing.",
				inputSchema: zodSchema(
					z.object({
						id: z.string().describe("Listing ID"),
						rating: z.number().min(1).max(5).describe("User rating 1-5"),
						note: z
							.string()
							.optional()
							.describe("Optional note about why they gave this rating"),
					}),
				),
				execute: async ({ id, rating, note }) => {
					const result = await options.rateListing(id, rating, note);
					return {
						success: true,
						calibrationTriggered: result.calibrationTriggered,
					};
				},
			}),
		},
	});
}
