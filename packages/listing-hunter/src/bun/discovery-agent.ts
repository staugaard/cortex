import { generateText, Output, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { ToolSet } from "ai";
import { z, type ZodObject, type ZodRawShape } from "zod";
import type { BaseListing } from "../types/index.js";
import { baseListingKeys } from "../types/index.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type SourceTools = ToolSet;

export interface DiscoveryAgentOptions {
	sourceTools: SourceTools;
	schema: ZodObject<ZodRawShape>;
	preferenceProfile: string | null;
	sourceName: string;
}

export interface DiscoveryResult<T extends BaseListing> {
	listings: T[];
	toolCallCount: number;
	stepsUsed: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DISCOVERY_MODEL_ID = "claude-sonnet-4-6";
const MAX_DISCOVERY_STEPS = 10;
const MAX_TOOL_OUTPUT_LENGTH = 80_000;

// Fields that are system-managed and should not be extracted by the LLM.
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

function buildExtractionSchema(
	fullSchema: ZodObject<ZodRawShape>,
): ZodObject<ZodRawShape> {
	const shape = fullSchema.shape;
	const extractableShape: Record<string, z.ZodTypeAny> = {};

	for (const [key, value] of Object.entries(shape)) {
		if (!SYSTEM_MANAGED_KEYS.has(key)) {
			extractableShape[key] = value;
		}
	}

	return z.object(extractableShape);
}

function describeSchema(schema: ZodObject<ZodRawShape>): string {
	const shape = schema.shape;
	const baseKeys = new Set(baseListingKeys);

	const baseFields: string[] = [];
	const domainFields: string[] = [];

	for (const key of Object.keys(shape)) {
		if (SYSTEM_MANAGED_KEYS.has(key)) continue;
		if (baseKeys.has(key as keyof BaseListing)) {
			baseFields.push(key);
		} else {
			domainFields.push(key);
		}
	}

	const parts = [`Base fields: ${baseFields.join(", ")}`];
	if (domainFields.length > 0) {
		parts.push(`Domain-specific fields: ${domainFields.join(", ")}`);
	}
	return parts.join(". ");
}

function buildSearchSystemPrompt(
	preferenceProfile: string | null,
	schemaDescription: string,
): string {
	const parts: string[] = [
		"You are a listing discovery agent. Your job is to search for new listings using the provided source tools.",
		"",
		"## Instructions",
		"1. Use the search tools to find listings. Start with a broad search.",
		"2. If results look promising and there are more pages, fetch additional pages (up to 3-4 pages total).",
		"3. If a search returns no results or irrelevant results, try different search parameters.",
		"4. You do NOT need to fetch individual listing detail pages unless the search results lack essential information.",
		"5. When you have collected enough search result pages, stop searching.",
		"6. After collecting results, briefly summarize what you found.",
		"",
		"## Listing Fields",
		schemaDescription,
	];

	if (preferenceProfile) {
		parts.push(
			"",
			"## User Preferences",
			"Use these preferences to guide your search parameters (price ranges, location, bedrooms, etc.):",
			preferenceProfile,
		);
	}

	return parts.join("\n");
}

function truncateToolOutput(output: unknown): string {
	const str =
		typeof output === "string" ? output : JSON.stringify(output, null, 2);
	if (str.length <= MAX_TOOL_OUTPUT_LENGTH) return str;
	return str.slice(0, MAX_TOOL_OUTPUT_LENGTH) + "\n<!-- truncated -->";
}

// ─── Discovery ──────────────────────────────────────────────────────────────

export async function runDiscovery<T extends BaseListing>(
	options: DiscoveryAgentOptions,
): Promise<DiscoveryResult<T>> {
	const schemaDescription = describeSchema(options.schema);

	// Phase 1: Search — agent calls source tools to collect raw content
	const searchResult = await generateText({
		model: anthropic(DISCOVERY_MODEL_ID),
		system: buildSearchSystemPrompt(
			options.preferenceProfile,
			schemaDescription,
		),
		tools: options.sourceTools,
		stopWhen: stepCountIs(MAX_DISCOVERY_STEPS),
		prompt:
			"Search for new listings. Use the available search tools to find current listings.",
	});

	let toolCallCount = 0;
	const toolOutputs: Array<{
		toolName: string;
		input: unknown;
		output: string;
	}> = [];

	for (const step of searchResult.steps) {
		for (const toolResult of step.toolResults) {
			toolCallCount++;
			toolOutputs.push({
				toolName: toolResult.toolName,
				input: toolResult.input,
				output: truncateToolOutput(toolResult.output),
			});
		}
	}

	if (toolOutputs.length === 0) {
		return { listings: [], toolCallCount: 0, stepsUsed: searchResult.steps.length };
	}

	// Phase 2: Extract — structured extraction from collected content
	const extractionSchema = buildExtractionSchema(options.schema);

	const extractionResult = await generateText({
		model: anthropic(DISCOVERY_MODEL_ID),
		output: Output.array({ element: extractionSchema }),
		system: [
			"You are a data extraction specialist. Extract all listings from the provided search results.",
			"For each listing, extract all available fields. If a field is not available, use null where the schema allows it.",
			`The sourceName for all listings is "${options.sourceName}".`,
			"Extract the sourceId from the listing URL or page identifier on the source platform.",
			"Extract the sourceUrl as the full URL to the individual listing page.",
			"Be thorough — extract every listing visible in the search results.",
			"Do not invent or fabricate data. Only extract what is present in the source content.",
		].join("\n"),
		prompt: `Extract listings from these search results:\n\n${JSON.stringify(toolOutputs, null, 2)}`,
	});

	const rawListings = extractionResult.experimental_output ?? [];

	// Hydrate with system-managed fields and validate through full schema
	const now = new Date();
	const listings: T[] = [];

	for (const raw of rawListings) {
		try {
			const hydrated = {
				...raw,
				id: crypto.randomUUID(),
				discoveredAt: now,
				aiRating: null,
				aiRatingReason: null,
				userRating: null,
				userRatingNote: null,
				archived: false,
			};
			const validated = options.schema.parse(hydrated) as T;
			listings.push(validated);
		} catch {
			// Skip listings that fail full schema validation
		}
	}

	return {
		listings,
		toolCallCount,
		stepsUsed: searchResult.steps.length,
	};
}
