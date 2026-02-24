import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baseListingSchema } from "../src/types/index.js";
import { createListingHunter } from "../src/bun/listing-hunter.js";

function createTestHunter() {
	const root = mkdtempSync(join(tmpdir(), "listing-hunter-test-"));
	const dbPath = join(root, "test.sqlite");
	const hunter = createListingHunter({
		schema: baseListingSchema,
		dbPath,
	});
	return {
		hunter,
		cleanup: () => {
			hunter.close();
			rmSync(root, { recursive: true, force: true });
		},
	};
}

describe("PipelineRunRepository", () => {
	test("create returns a running record", () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			const run = hunter.pipelineRuns.create("run-1");
			expect(run.id).toBe("run-1");
			expect(run.status).toBe("running");
			expect(run.completedAt).toBeNull();
			expect(run.stats).toEqual({ discovered: 0, duplicates: 0, new: 0, rated: 0 });
		} finally {
			cleanup();
		}
	});

	test("complete updates status and stats", () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			hunter.pipelineRuns.create("run-1");
			hunter.pipelineRuns.complete("run-1", {
				discovered: 10,
				duplicates: 3,
				new: 7,
				rated: 7,
			});
			const latest = hunter.pipelineRuns.getLatest();
			expect(latest!.status).toBe("completed");
			expect(latest!.completedAt).not.toBeNull();
			expect(latest!.stats.new).toBe(7);
		} finally {
			cleanup();
		}
	});

	test("fail updates status and error", () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			hunter.pipelineRuns.create("run-1");
			hunter.pipelineRuns.fail("run-1", "Network error");
			const latest = hunter.pipelineRuns.getLatest();
			expect(latest!.status).toBe("failed");
			expect(latest!.error).toBe("Network error");
		} finally {
			cleanup();
		}
	});

	test("getLatest returns most recent run", async () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			hunter.pipelineRuns.create("run-1");
			hunter.pipelineRuns.complete("run-1", { discovered: 0, duplicates: 0, new: 0, rated: 0 });
			// Ensure a different timestamp for ordering
			await new Promise((r) => setTimeout(r, 5));
			hunter.pipelineRuns.create("run-2");
			const latest = hunter.pipelineRuns.getLatest();
			expect(latest!.id).toBe("run-2");
		} finally {
			cleanup();
		}
	});

	test("getLatest returns null when empty", () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			expect(hunter.pipelineRuns.getLatest()).toBeNull();
		} finally {
			cleanup();
		}
	});
});
