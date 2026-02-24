import { eq, desc } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { PipelineRunStats, PipelineRunStatus } from "../types/index.js";
import { pipelineRuns } from "./schema.js";

export interface PipelineRunRecord {
	id: string;
	startedAt: string;
	completedAt: string | null;
	status: PipelineRunStatus;
	stats: PipelineRunStats;
	error: string | null;
}

export interface PipelineRunRepository {
	create(id: string): PipelineRunRecord;
	complete(id: string, stats: PipelineRunStats): void;
	fail(id: string, error: string): void;
	getLatest(): PipelineRunRecord | null;
}

export function createPipelineRunRepository(
	db: BunSQLiteDatabase,
): PipelineRunRepository {
	const emptyStats: PipelineRunStats = {
		discovered: 0,
		duplicates: 0,
		new: 0,
		rated: 0,
	};

	function toRecord(row: typeof pipelineRuns.$inferSelect): PipelineRunRecord {
		return {
			id: row.id,
			startedAt: row.startedAt,
			completedAt: row.completedAt,
			status: row.status as PipelineRunStatus,
			stats: row.stats as PipelineRunStats,
			error: row.error,
		};
	}

	return {
		create(id: string): PipelineRunRecord {
			const now = new Date().toISOString();
			const values = {
				id,
				startedAt: now,
				status: "running" as const,
				stats: emptyStats,
			};
			db.insert(pipelineRuns).values(values).run();
			return {
				...values,
				completedAt: null,
				error: null,
			};
		},

		complete(id: string, stats: PipelineRunStats): void {
			const now = new Date().toISOString();
			db.update(pipelineRuns)
				.set({
					status: "completed",
					completedAt: now,
					stats,
				})
				.where(eq(pipelineRuns.id, id))
				.run();
		},

		fail(id: string, error: string): void {
			const now = new Date().toISOString();
			db.update(pipelineRuns)
				.set({
					status: "failed",
					completedAt: now,
					error,
				})
				.where(eq(pipelineRuns.id, id))
				.run();
		},

		getLatest(): PipelineRunRecord | null {
			const rows = db
				.select()
				.from(pipelineRuns)
				.orderBy(desc(pipelineRuns.startedAt))
				.limit(1)
				.all();
			if (rows.length === 0) return null;
			return toRecord(rows[0]);
		},
	};
}
