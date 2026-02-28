import { generateText, Output, stepCountIs, type ToolSet } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { ZodObject, ZodRawShape } from "zod";
import type { BaseListing } from "../types/index.js";
import type { EnrichFn } from "./pipeline.js";

// ─── Constants ──────────────────────────────────────────────────────────────

const ENRICHMENT_MODEL_ID = "claude-sonnet-4-6";

// Fields that are system-managed and should not be sent to the enrichment agent.
const SYSTEM_MANAGED_KEYS = new Set<string>([
	"id",
	"discoveredAt",
	"aiRating",
	"aiRatingReason",
	"userRating",
	"userRatingNote",
	"archived",
]);

// ─── Helpers ────────────────────────────────────────────────────────────────

function serializeListing(listing: BaseListing): Record<string, unknown> {
	const serialized: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(listing)) {
		if (SYSTEM_MANAGED_KEYS.has(key)) continue;
		serialized[key] = value instanceof Date ? value.toISOString() : value;
	}

	return serialized;
}

function buildEnrichmentSystemPrompt(
	enrichmentPrompt: string,
	preferenceProfile: string | null,
): string {
	const parts: string[] = [
		"You are an enrichment agent that adds contextual information to listings.",
		"You will be given a listing and must produce structured enrichment data.",
		"Use the available tools to gather real data (e.g., commute times, distances).",
		"Only return fields you can confidently fill. If you cannot determine a value, set it to null.",
		"",
		"## Enrichment Task",
		enrichmentPrompt,
	];

	if (preferenceProfile) {
		parts.push(
			"",
			"## User Preference Profile",
			"Use this to understand what the user cares about (commute destinations, travel modes, etc.):",
			preferenceProfile,
		);
	}

	return parts.join("\n");
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createDefaultEnrichFn<T extends BaseListing>(
	enrichmentSchema: ZodObject<ZodRawShape>,
	enrichmentTools?: ToolSet,
): EnrichFn<T> {
	return async (listing, enrichmentPrompt, preferenceProfile) => {
		const listingLabel = listing.sourceId ?? listing.id;
		console.log(`[enrich] starting ${listingLabel} (model=${ENRICHMENT_MODEL_ID}, tools=${Object.keys(enrichmentTools ?? {}).join(", ") || "none"})`);

		const result = await generateText({
			model: anthropic(ENRICHMENT_MODEL_ID),
			tools: enrichmentTools ?? {},
			stopWhen: stepCountIs(enrichmentTools ? 5 : 1),
			output: Output.object({ schema: enrichmentSchema }),
			system: buildEnrichmentSystemPrompt(enrichmentPrompt, preferenceProfile),
			prompt: `Enrich this listing:\n${JSON.stringify(serializeListing(listing), null, 2)}`,
		});

		// Log step-by-step tool usage
		for (const step of result.steps) {
			for (const tc of step.toolCalls) {
				console.log(`[enrich] ${listingLabel} → tool=${tc.toolName} args=${JSON.stringify((tc as Record<string, unknown>).args)}`);
			}
			for (const tr of step.toolResults) {
				console.log(`[enrich] ${listingLabel} ← tool=${tr.toolName} result=${JSON.stringify((tr as Record<string, unknown>).result)}`);
			}
		}

		const output = result.experimental_output;
		if (!output) throw new Error("Enrichment agent returned no structured output");

		console.log(`[enrich] ${listingLabel} done (${result.steps.length} steps, ${result.usage.totalTokens} tokens): ${JSON.stringify(output)}`);
		return output as Partial<T>;
	};
}
