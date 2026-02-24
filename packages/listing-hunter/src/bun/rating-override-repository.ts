import { eq, desc } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { ratingOverrides } from "./schema.js";

export interface RatingOverrideRecord {
	id: string;
	listingId: string;
	aiRating: number;
	userRating: number;
	userNote: string | null;
	createdAt: string;
}

export interface RatingOverrideRepository {
	insert(override: Omit<RatingOverrideRecord, "createdAt">): void;
	getByListingId(listingId: string): RatingOverrideRecord[];
}

export function createRatingOverrideRepository(
	db: BunSQLiteDatabase,
): RatingOverrideRepository {
	return {
		insert(override: Omit<RatingOverrideRecord, "createdAt">): void {
			const now = new Date().toISOString();
			db.insert(ratingOverrides)
				.values({
					id: override.id,
					listingId: override.listingId,
					aiRating: override.aiRating,
					userRating: override.userRating,
					userNote: override.userNote,
					createdAt: now,
				})
				.run();
		},

		getByListingId(listingId: string): RatingOverrideRecord[] {
			return db
				.select()
				.from(ratingOverrides)
				.where(eq(ratingOverrides.listingId, listingId))
				.orderBy(desc(ratingOverrides.createdAt))
				.all();
		},
	};
}
