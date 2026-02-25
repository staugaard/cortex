import { eq, desc, gt, sql } from "drizzle-orm";
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
	getAll(): RatingOverrideRecord[];
	countSince(date: string | null): number;
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

		getAll(): RatingOverrideRecord[] {
			return db
				.select()
				.from(ratingOverrides)
				.orderBy(desc(ratingOverrides.createdAt))
				.all();
		},

		countSince(date: string | null): number {
			if (!date) {
				const rows = db
					.select({ count: sql<number>`count(*)` })
					.from(ratingOverrides)
					.all();
				return rows[0]?.count ?? 0;
			}

			const rows = db
				.select({ count: sql<number>`count(*)` })
				.from(ratingOverrides)
				.where(gt(ratingOverrides.createdAt, date))
				.all();
			return rows[0]?.count ?? 0;
		},
	};
}
