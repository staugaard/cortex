import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { sourceCursors } from "./schema.js";

export interface SourceCursorRecord {
	sourceName: string;
	cursorValue: string;
	lastRunAt: string;
}

export interface SourceCursorRepository {
	get(sourceName: string): SourceCursorRecord | null;
	set(sourceName: string, cursorValue: string): void;
}

export function createSourceCursorRepository(
	db: BunSQLiteDatabase,
): SourceCursorRepository {
	return {
		get(sourceName: string): SourceCursorRecord | null {
			const rows = db
				.select()
				.from(sourceCursors)
				.where(eq(sourceCursors.sourceName, sourceName))
				.all();
			if (rows.length === 0) return null;
			return rows[0];
		},

		set(sourceName: string, cursorValue: string): void {
			const now = new Date().toISOString();
			db.insert(sourceCursors)
				.values({ sourceName, cursorValue, lastRunAt: now })
				.onConflictDoUpdate({
					target: sourceCursors.sourceName,
					set: { cursorValue, lastRunAt: now },
				})
				.run();
		},
	};
}
