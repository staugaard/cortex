import type { z } from "zod";
import { eq, sql, and, desc } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { baseListingKeys } from "../types/index.js";
import type { BaseListing, ListingFilter, ListingSort } from "../types/index.js";
import { listings } from "./schema.js";

type ListingRow = typeof listings.$inferSelect;

export interface ListingRepository<T extends BaseListing> {
	insert(listing: T): void;
	getById(id: string): T | null;
	query(filter: ListingFilter, sort?: ListingSort, limit?: number, offset?: number): { listings: T[]; total: number };
	queryUnrated(limit?: number): T[];
	queryUnenriched(limit?: number): T[];
	updateRating(id: string, userRating: number, userNote?: string): T | null;
	updateAiRating(id: string, aiRating: number, aiRatingReason: string): void;
	updateMetadata(id: string, updates: Partial<T>): void;
	markEnriched(id: string): void;
	archive(id: string): void;
	existsBySourceKey(sourceName: string, sourceId: string): boolean;
}

export function createListingRepository<T extends BaseListing>(
	db: BunSQLiteDatabase,
	schema: z.ZodType<T>,
): ListingRepository<T> {
	const baseKeySet = new Set<string>(baseListingKeys);

	function assertValidUserRating(userRating: number): void {
		if (
			!Number.isInteger(userRating) ||
			userRating < 1 ||
			userRating > 5
		) {
			throw new Error("userRating must be an integer between 1 and 5");
		}
	}

	function splitMetadata(listing: T): { base: Omit<BaseListing, "images">; metadata: Record<string, unknown>; images: string[] } {
		const metadata: Record<string, unknown> = {};
		const base: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(listing)) {
			if (baseKeySet.has(key)) {
				base[key] = value;
			} else {
				metadata[key] = value;
			}
		}

		return {
			base: base as Omit<BaseListing, "images">,
			metadata,
			images: listing.images,
		};
	}

	function rowToListing(row: ListingRow): T {
		const raw: Record<string, unknown> = {
			id: row.id,
			sourceId: row.sourceId,
			sourceName: row.sourceName,
			sourceUrl: row.sourceUrl,
			title: row.title,
			description: row.description,
			images: row.images,
			discoveredAt: row.discoveredAt,
			aiRating: row.aiRating,
			aiRatingReason: row.aiRatingReason,
			userRating: row.userRating,
			userRatingNote: row.userRatingNote,
			archived: row.archived,
			...(row.metadata as Record<string, unknown>),
		};
		return schema.parse(raw);
	}

	return {
		insert(listing: T): void {
			const now = new Date().toISOString();
			const { base, metadata, images } = splitMetadata(listing);

			db.insert(listings)
				.values({
					id: base.id as string,
					sourceId: base.sourceId as string,
					sourceName: base.sourceName as string,
					sourceUrl: base.sourceUrl as string,
					title: base.title as string,
					description: base.description as string,
					images,
					metadata,
					aiRating: base.aiRating as number | null,
					aiRatingReason: base.aiRatingReason as string | null,
					userRating: base.userRating as number | null,
					userRatingNote: base.userRatingNote as string | null,
					archived: base.archived as boolean,
					discoveredAt: (base.discoveredAt instanceof Date
						? base.discoveredAt.toISOString()
						: String(base.discoveredAt)),
					createdAt: now,
					updatedAt: now,
				})
				.run();
		},

		getById(id: string): T | null {
			const rows = db
				.select()
				.from(listings)
				.where(eq(listings.id, id))
				.all();
			if (rows.length === 0) return null;
			return rowToListing(rows[0]);
		},

		query(filter: ListingFilter, sort: ListingSort = "rating", limit = 50, offset = 0): { listings: T[]; total: number } {
			const condition =
				filter === "new"
					? and(eq(listings.archived, false), sql`${listings.userRating} IS NULL`)
					: filter === "shortlist"
						? and(eq(listings.archived, false), sql`${listings.userRating} >= 4`)
						: filter === "archived"
							? eq(listings.archived, true)
							: undefined; // "all" — no filter

			const totalRows = db
				.select({ count: sql<number>`count(*)` })
				.from(listings)
				.where(condition)
				.all();
			const total = totalRows[0]?.count ?? 0;

			const orderBy =
				sort === "newest"
					? [desc(listings.discoveredAt)]
					: [sql`${listings.aiRating} DESC NULLS LAST`, desc(listings.discoveredAt)];

			const rows = db
				.select()
				.from(listings)
				.where(condition)
				.orderBy(...orderBy)
				.limit(limit)
				.offset(offset)
				.all();

			return {
				listings: rows.map(rowToListing),
				total,
			};
		},

		queryUnrated(limit = 100): T[] {
			const rows = db
				.select()
				.from(listings)
				.where(
					and(
						eq(listings.archived, false),
						sql`${listings.aiRating} IS NULL`,
					),
				)
				.orderBy(desc(listings.discoveredAt))
				.limit(limit)
				.all();
			return rows.map(rowToListing);
		},

		queryUnenriched(limit = 100): T[] {
			const rows = db
				.select()
				.from(listings)
				.where(
					and(
						eq(listings.archived, false),
						sql`${listings.enrichedAt} IS NULL`,
					),
				)
				.orderBy(desc(listings.discoveredAt))
				.limit(limit)
				.all();
			return rows.map(rowToListing);
		},

		updateAiRating(id: string, aiRating: number, aiRatingReason: string): void {
			const now = new Date().toISOString();
			db.update(listings)
				.set({
					aiRating,
					aiRatingReason,
					updatedAt: now,
				})
				.where(eq(listings.id, id))
				.run();
		},

		updateRating(id: string, userRating: number, userNote?: string): T | null {
			assertValidUserRating(userRating);
			const now = new Date().toISOString();
			db.update(listings)
				.set({
					userRating,
					userRatingNote: userNote ?? null,
					updatedAt: now,
				})
				.where(eq(listings.id, id))
				.run();
			return this.getById(id);
		},

		updateMetadata(id: string, updates: Partial<T>): void {
			const now = new Date().toISOString();
			const rows = db
				.select({ metadata: listings.metadata })
				.from(listings)
				.where(eq(listings.id, id))
				.all();
			if (rows.length === 0) return;

			const currentMetadata = rows[0].metadata as Record<string, unknown>;
			const { metadata: newMetadata } = splitMetadata(updates as T);
			const mergedMetadata = { ...currentMetadata, ...newMetadata };

			db.update(listings)
				.set({ metadata: mergedMetadata, updatedAt: now })
				.where(eq(listings.id, id))
				.run();
		},

		markEnriched(id: string): void {
			const now = new Date().toISOString();
			db.update(listings)
				.set({ enrichedAt: now, updatedAt: now })
				.where(eq(listings.id, id))
				.run();
		},

		archive(id: string): void {
			const now = new Date().toISOString();
			db.update(listings)
				.set({ archived: true, updatedAt: now })
				.where(eq(listings.id, id))
				.run();
		},

		existsBySourceKey(sourceName: string, sourceId: string): boolean {
			const rows = db
				.select({ id: listings.id })
				.from(listings)
				.where(
					and(
						eq(listings.sourceName, sourceName),
						eq(listings.sourceId, sourceId),
					),
				)
				.all();
			return rows.length > 0;
		},
	};
}
