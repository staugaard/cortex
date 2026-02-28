import { z } from "zod";
import { baseListingSchema } from "@cortex/listing-hunter/types";

export const rentalListingSchema = baseListingSchema.extend({
	weeklyRent: z.number(),
	bedrooms: z.number(),
	bathrooms: z.number(),
	lounges: z.number().nullable(),
	suburb: z.string(),
	propertyType: z.string(),
	parkingSpaces: z.number().nullable(),
	maxTenants: z.number().nullable(),
	petFriendly: z.boolean().nullable(),
	availableFrom: z.coerce.date().nullable(),
	latitude: z.number().nullable(),
	longitude: z.number().nullable(),
	commuteEstimate: z.string().nullable().optional(),
	neighbourhoodDescription: z.string().nullable().optional(),
	personalizedSummary: z.string().nullable().optional(),
});

export type RentalListing = z.infer<typeof rentalListingSchema>;

export const rentalEnrichmentSchema = z.object({
	commuteEstimate: z.string().describe(
		"Commute summary based on user's preferred destinations and travel modes from their preference profile",
	),
	neighbourhoodDescription: z.string().describe(
		"Brief neighbourhood character, nearby amenities, and general vibe",
	),
	personalizedSummary: z.string().describe(
		"A concise, personalized summary of why this listing may or may not suit the user, " +
		"synthesizing all listing data (property details, description, commute times, neighbourhood) " +
		"against the user's preference profile. Write in second person ('you').",
	),
});
