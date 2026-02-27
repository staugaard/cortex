import { ToolLoopAgent, tool, zodSchema } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z, type ZodObject, type ZodRawShape } from "zod";
import type { BaseListing } from "../types/index.js";
import { baseListingKeys } from "../types/index.js";
import type { DocumentRepository } from "./document-repository.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface InterviewAgentOptions {
	schema: ZodObject<ZodRawShape>;
	documents: DocumentRepository;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const INTERVIEW_MODEL_ID = "claude-sonnet-4-6";

// Fields that are system-managed and should not be discussed in the interview.
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

function getZodTypeName(schema: z.ZodTypeAny): string {
	if (schema instanceof z.ZodString) return "string";
	if (schema instanceof z.ZodNumber) return "number";
	if (schema instanceof z.ZodBoolean) return "boolean";
	if (schema instanceof z.ZodDate) return "date";
	if (schema instanceof z.ZodArray) return "array";
	if (schema instanceof z.ZodNullable) return `${getZodTypeName(schema.unwrap())} (optional)`;
	if (schema instanceof z.ZodOptional) return `${getZodTypeName(schema.unwrap())} (optional)`;
	return "unknown";
}

function describeSchemaForInterview(schema: ZodObject<ZodRawShape>): string {
	const shape = schema.shape;
	const baseKeys = new Set(baseListingKeys);
	const fields: string[] = [];

	for (const [key, value] of Object.entries(shape)) {
		// Skip system-managed keys — not relevant to user preferences
		if (SYSTEM_MANAGED_KEYS.has(key)) continue;
		// Skip common base fields that aren't interview-relevant
		if (baseKeys.has(key as keyof BaseListing)) continue;

		const typeName = getZodTypeName(value as z.ZodTypeAny);
		fields.push(`- ${key} (${typeName})`);
	}

	return fields.join("\n");
}

function buildInterviewSystemPrompt(
	schemaDescription: string,
	existingProfile: string | null,
): string {
	const parts: string[] = [
		"You are an interview agent helping a user define their preferences for a listing search.",
		"Your job is to have a natural conversation to understand what the user is looking for.",
		"",
		"## Domain Fields",
		"These are the fields you should ask about:",
		schemaDescription,
		"",
		"## Instructions",
		"1. Ask about each relevant field naturally — don't list them all at once.",
		"2. Ask about tradeoffs (e.g., would they accept fewer bedrooms for a better location?).",
		"3. Ask follow-up questions to understand their priorities.",
		"4. When you have enough information, call `save_preference_profile` with a clear, structured summary.",
		"5. The profile should be written as a concise document that another AI agent can use to search and rate listings.",
		"6. After saving, confirm to the user that their preferences have been saved.",
		"7. Keep the conversation friendly and focused. 3-5 questions is usually enough.",
	];

	if (existingProfile) {
		parts.push(
			"",
			"## Existing Profile",
			"The user already has a preference profile. Review it and ask what they'd like to change:",
			existingProfile,
		);
	}

	return parts.join("\n");
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createInterviewAgent(options: InterviewAgentOptions) {
	const schemaDescription = describeSchemaForInterview(options.schema);
	const existingProfile = options.documents.get("preference_profile")?.content ?? null;

	return new ToolLoopAgent({
		model: anthropic(INTERVIEW_MODEL_ID),
		instructions: buildInterviewSystemPrompt(schemaDescription, existingProfile),
		tools: {
			save_preference_profile: tool<
				{ content: string },
				{ saved: boolean }
			>({
				description: "Save the user's preference profile after gathering enough information.",
				inputSchema: zodSchema(
					z.object({
						content: z.string().describe("The preference profile as a structured text document."),
					}),
				),
				execute: async ({ content }) => {
					options.documents.set("preference_profile", content);
					return { saved: true };
				},
			}),
		},
	});
}
