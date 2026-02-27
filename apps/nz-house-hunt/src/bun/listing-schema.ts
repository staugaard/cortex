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
});

export type RentalListing = z.infer<typeof rentalListingSchema>;
