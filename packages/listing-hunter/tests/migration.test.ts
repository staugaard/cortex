import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { ensureSchema } from "../src/bun/migrate.js";

function createTestDb() {
	const root = mkdtempSync(join(tmpdir(), "listing-hunter-test-"));
	const dbPath = join(root, "test.sqlite");
	const db = new Database(dbPath, { create: true, strict: true });
	db.exec("PRAGMA journal_mode = WAL");
	return {
		db,
		cleanup: () => {
			db.close();
			rmSync(root, { recursive: true, force: true });
		},
	};
}

describe("ensureSchema", () => {
	test("creates all tables on first run", () => {
		const { db, cleanup } = createTestDb();
		try {
			ensureSchema(db);

			const tables = db
				.query(
					"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
				)
				.all() as { name: string }[];

			const tableNames = tables.map((t) => t.name).sort();
			expect(tableNames).toEqual([
				"documents",
				"listings",
				"pipeline_runs",
				"rating_overrides",
				"schema_migrations",
				"source_cursors",
			]);
		} finally {
			cleanup();
		}
	});

	test("is idempotent — running twice does not error", () => {
		const { db, cleanup } = createTestDb();
		try {
			ensureSchema(db);
			ensureSchema(db);

			const version = db
				.query("SELECT MAX(version) AS version FROM schema_migrations")
				.get() as { version: number };
			expect(version.version).toBe(1);
		} finally {
			cleanup();
		}
	});

	test("listings table has unique constraint on source_name + source_id", () => {
		const { db, cleanup } = createTestDb();
		try {
			ensureSchema(db);

			db.query(
				`INSERT INTO listings (id, source_id, source_name, source_url, title, description, images, metadata, discovered_at, created_at, updated_at)
				 VALUES ('a', '1', 'test', 'https://example.com', 'Title', 'Desc', '[]', '{}', datetime('now'), datetime('now'), datetime('now'))`,
			).run();

			expect(() => {
				db.query(
					`INSERT INTO listings (id, source_id, source_name, source_url, title, description, images, metadata, discovered_at, created_at, updated_at)
					 VALUES ('b', '1', 'test', 'https://example.com', 'Title2', 'Desc2', '[]', '{}', datetime('now'), datetime('now'), datetime('now'))`,
				).run();
			}).toThrow();
		} finally {
			cleanup();
		}
	});
});
