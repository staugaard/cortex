import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { DocumentType } from "../types/index.js";
import { documents } from "./schema.js";

export interface DocumentRecord {
	type: DocumentType;
	content: string;
	updatedAt: string;
}

export interface DocumentRepository {
	get(type: DocumentType): DocumentRecord | null;
	set(type: DocumentType, content: string): void;
	getAll(): DocumentRecord[];
}

export function createDocumentRepository(
	db: BunSQLiteDatabase,
): DocumentRepository {
	return {
		get(type: DocumentType): DocumentRecord | null {
			const rows = db
				.select()
				.from(documents)
				.where(eq(documents.type, type))
				.all();
			if (rows.length === 0) return null;
			return rows[0] as DocumentRecord;
		},

		set(type: DocumentType, content: string): void {
			const now = new Date().toISOString();
			db.insert(documents)
				.values({ type, content, updatedAt: now })
				.onConflictDoUpdate({
					target: documents.type,
					set: { content, updatedAt: now },
				})
				.run();
		},

		getAll(): DocumentRecord[] {
			return db.select().from(documents).all() as DocumentRecord[];
		},
	};
}
