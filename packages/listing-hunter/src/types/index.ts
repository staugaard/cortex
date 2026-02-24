import { z } from "zod";

// ─── Base Listing Schema ─────────────────────────────────────────────────────
// Every listing, regardless of domain, has these fields.
// Apps extend this with domain-specific fields (rent, bedrooms, etc.).

export const baseListingSchema = z.object({
	id: z.string(),
	sourceId: z.string(),
	sourceName: z.string(),
	sourceUrl: z.string().url(),
	title: z.string(),
	description: z.string(),
	images: z.array(z.string().url()),
	discoveredAt: z.coerce.date(),
	aiRating: z.number().min(1).max(5).nullable(),
	aiRatingReason: z.string().nullable(),
	userRating: z.number().min(1).max(5).nullable(),
	userRatingNote: z.string().nullable(),
	archived: z.boolean(),
});

export type BaseListing = z.infer<typeof baseListingSchema>;

// ─── Document Types ──────────────────────────────────────────────────────────

export type DocumentType = "preference_profile" | "calibration_log";

// ─── Pipeline Run Status ─────────────────────────────────────────────────────

export type PipelineRunStatus = "running" | "completed" | "failed";

export type PipelineRunStats = {
	discovered: number;
	duplicates: number;
	new: number;
	rated: number;
};

// ─── Listing Filter ──────────────────────────────────────────────────────────

export type ListingFilter = "new" | "shortlist" | "all" | "archived";

// ─── Base field keys ─────────────────────────────────────────────────────────
// Used by the database layer to split base columns from metadata JSON.

export const baseListingKeys = Object.keys(
	baseListingSchema.shape,
) as ReadonlyArray<keyof BaseListing>;
