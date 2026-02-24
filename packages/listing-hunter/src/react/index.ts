import type {
	RequireWebRuntime,
	WebRuntimeFlag,
} from "../internal/runtime-tags.js";

const assertWebRuntime: RequireWebRuntime<WebRuntimeFlag> = true;
void assertWebRuntime;

// React components will be added in Phase 5.
export {};
