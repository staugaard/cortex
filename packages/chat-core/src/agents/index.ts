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
 * shared manager/subagent composition helpers.
 */
export interface AgentsPlaceholder {
	readonly kind: "agents-placeholder";
	readonly phase: "phase-1";
}

export function createAgentsPlaceholder(): AgentsPlaceholder {
	return {
		kind: "agents-placeholder",
		phase: "phase-1",
	};
}
