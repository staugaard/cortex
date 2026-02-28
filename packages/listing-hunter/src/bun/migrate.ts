import type { Database } from "bun:sqlite";

const SCHEMA_VERSION = 2;

export function ensureSchema(db: Database): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			applied_at TEXT NOT NULL
		)
	`);

	const versionRow = db
		.query("SELECT MAX(version) AS version FROM schema_migrations")
		.get() as { version: number | null } | null;
	const currentVersion = versionRow?.version ?? 0;

	if (currentVersion >= SCHEMA_VERSION) {
		return;
	}

	if (currentVersion < 1) {
		db.transaction(() => {
			db.exec(`
				CREATE TABLE IF NOT EXISTS listings (
					id            TEXT PRIMARY KEY,
					source_id     TEXT NOT NULL,
					source_name   TEXT NOT NULL,
					source_url    TEXT NOT NULL,
					title         TEXT NOT NULL,
					description   TEXT NOT NULL,
					images        TEXT NOT NULL,
					metadata      TEXT NOT NULL,
					ai_rating     INTEGER,
					ai_rating_reason TEXT,
					user_rating   INTEGER,
					user_rating_note TEXT,
					archived      INTEGER NOT NULL DEFAULT 0,
					discovered_at TEXT NOT NULL,
					created_at    TEXT NOT NULL,
					updated_at    TEXT NOT NULL,
					UNIQUE(source_name, source_id)
				)
			`);
			db.exec(`
				CREATE INDEX IF NOT EXISTS idx_listings_discovered_at
				ON listings(discovered_at DESC)
			`);
			db.exec(`
				CREATE TABLE IF NOT EXISTS rating_overrides (
					id            TEXT PRIMARY KEY,
					listing_id    TEXT NOT NULL REFERENCES listings(id),
					ai_rating     INTEGER NOT NULL,
					user_rating   INTEGER NOT NULL,
					user_note     TEXT,
					created_at    TEXT NOT NULL
				)
			`);
			db.exec(`
				CREATE INDEX IF NOT EXISTS idx_rating_overrides_listing_id
				ON rating_overrides(listing_id)
			`);
			db.exec(`
				CREATE TABLE IF NOT EXISTS documents (
					type          TEXT PRIMARY KEY,
					content       TEXT NOT NULL,
					updated_at    TEXT NOT NULL
				)
			`);
			db.exec(`
				CREATE TABLE IF NOT EXISTS source_cursors (
					source_name   TEXT PRIMARY KEY,
					cursor_value  TEXT NOT NULL,
					last_run_at   TEXT NOT NULL
				)
			`);
			db.exec(`
				CREATE TABLE IF NOT EXISTS pipeline_runs (
					id            TEXT PRIMARY KEY,
					started_at    TEXT NOT NULL,
					completed_at  TEXT,
					status        TEXT NOT NULL,
					stats         TEXT NOT NULL,
					error         TEXT
				)
			`);
			db.exec(
				`INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (1, datetime('now'))`,
			);
		})();
	}

	if (currentVersion < 2) {
		db.transaction(() => {
			db.exec(`ALTER TABLE listings ADD COLUMN enriched_at TEXT`);
			db.exec(
				`INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (2, datetime('now'))`,
			);
		})();
	}
}
