import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
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

describe("DocumentRepository", () => {
	test("get returns null for missing document", () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			expect(hunter.documents.get("preference_profile")).toBeNull();
		} finally {
			cleanup();
		}
	});

	test("set and get round-trip", () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			hunter.documents.set("preference_profile", "I want a quiet house");
			const doc = hunter.documents.get("preference_profile");
			expect(doc).not.toBeNull();
			expect(doc!.content).toBe("I want a quiet house");
			expect(doc!.type).toBe("preference_profile");
		} finally {
			cleanup();
		}
	});

	test("set upserts on conflict", () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			hunter.documents.set("calibration_log", "v1");
			hunter.documents.set("calibration_log", "v2");
			const doc = hunter.documents.get("calibration_log");
			expect(doc!.content).toBe("v2");
		} finally {
			cleanup();
		}
	});

	test("getAll returns all documents", () => {
		const { hunter, cleanup } = createTestHunter();
		try {
			hunter.documents.set("preference_profile", "prefs");
			hunter.documents.set("calibration_log", "cal");
			const docs = hunter.documents.getAll();
			expect(docs.length).toBe(2);
		} finally {
			cleanup();
		}
	});
});
