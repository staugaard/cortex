import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const listings = sqliteTable("listings", {
	id: text("id").primaryKey(),
	sourceId: text("source_id").notNull(),
	sourceName: text("source_name").notNull(),
	sourceUrl: text("source_url").notNull(),
	title: text("title").notNull(),
	description: text("description").notNull(),
	images: text("images", { mode: "json" }).notNull().$type<string[]>(),
	metadata: text("metadata", { mode: "json" }).notNull().$type<Record<string, unknown>>(),
	aiRating: integer("ai_rating"),
	aiRatingReason: text("ai_rating_reason"),
	userRating: integer("user_rating"),
	userRatingNote: text("user_rating_note"),
	archived: integer("archived", { mode: "boolean" }).notNull().default(false),
	discoveredAt: text("discovered_at").notNull(),
	enrichedAt: text("enriched_at"),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const ratingOverrides = sqliteTable("rating_overrides", {
	id: text("id").primaryKey(),
	listingId: text("listing_id").notNull(),
	aiRating: integer("ai_rating").notNull(),
	userRating: integer("user_rating").notNull(),
	userNote: text("user_note"),
	createdAt: text("created_at").notNull(),
});

export const documents = sqliteTable("documents", {
	type: text("type").primaryKey(),
	content: text("content").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const sourceCursors = sqliteTable("source_cursors", {
	sourceName: text("source_name").primaryKey(),
	cursorValue: text("cursor_value").notNull(),
	lastRunAt: text("last_run_at").notNull(),
});

export const pipelineRuns = sqliteTable("pipeline_runs", {
	id: text("id").primaryKey(),
	startedAt: text("started_at").notNull(),
	completedAt: text("completed_at"),
	status: text("status").notNull(),
	stats: text("stats", { mode: "json" }).notNull().$type<{
		discovered: number;
		duplicates: number;
		new: number;
		rated: number;
	}>(),
	error: text("error"),
});
