import type {
	BunRuntimeFlag,
	RequireBunRuntime,
} from "../internal/runtime-tags";

/**
 * Compile-time runtime boundary check.
 * If this module is typechecked in a non-Bun project, it fails.
 */
const assertBunRuntime: RequireBunRuntime<BunRuntimeFlag> = true;
void assertBunRuntime;

/**
 * Phase 2+ implementation target:
 * SQLite-backed chat repository.
 */
export interface PersistencePlaceholder {
	readonly kind: "persistence-placeholder";
	readonly phase: "phase-1";
}

export function createPersistencePlaceholder(): PersistencePlaceholder {
	return {
		kind: "persistence-placeholder",
		phase: "phase-1",
	};
}
