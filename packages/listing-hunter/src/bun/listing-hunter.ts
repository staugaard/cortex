import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { z } from "zod";
import type { BaseListing } from "../types/index.js";
import { ensureSchema } from "./migrate.js";
import {
	createListingRepository,
	type ListingRepository,
} from "./listing-repository.js";
import {
	createDocumentRepository,
	type DocumentRepository,
} from "./document-repository.js";
import {
	createSourceCursorRepository,
	type SourceCursorRepository,
} from "./source-cursor-repository.js";
import {
	createPipelineRunRepository,
	type PipelineRunRepository,
} from "./pipeline-run-repository.js";
import {
	createRatingOverrideRepository,
	type RatingOverrideRepository,
} from "./rating-override-repository.js";

export interface ListingHunterOptions<T extends BaseListing> {
	schema: z.ZodType<T>;
	dbPath: string;
}

export interface ListingHunter<T extends BaseListing> {
	listings: ListingRepository<T>;
	documents: DocumentRepository;
	sourceCursors: SourceCursorRepository;
	pipelineRuns: PipelineRunRepository;
	ratingOverrides: RatingOverrideRepository;
	close(): void;
}

export function createListingHunter<T extends BaseListing>(
	options: ListingHunterOptions<T>,
): ListingHunter<T> {
	mkdirSync(dirname(options.dbPath), { recursive: true });

	const sqlite = new Database(options.dbPath, { create: true, strict: true });
	sqlite.exec("PRAGMA journal_mode = WAL");
	ensureSchema(sqlite);

	const db = drizzle(sqlite);

	return {
		listings: createListingRepository<T>(db, options.schema),
		documents: createDocumentRepository(db),
		sourceCursors: createSourceCursorRepository(db),
		pipelineRuns: createPipelineRunRepository(db),
		ratingOverrides: createRatingOverrideRepository(db),
		close() {
			sqlite.close();
		},
	};
}
