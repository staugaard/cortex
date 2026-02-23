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
 * Bun-side stream forwarding bridge.
 */
export interface BunTransportPlaceholder {
	readonly kind: "bun-transport-placeholder";
	readonly phase: "phase-1";
}

export function createBunTransportPlaceholder(): BunTransportPlaceholder {
	return {
		kind: "bun-transport-placeholder",
		phase: "phase-1",
	};
}
