import type {
	RequireWebRuntime,
	WebRuntimeFlag,
} from "../internal/runtime-tags";

/**
 * Compile-time runtime boundary check.
 * If this module is typechecked in a non-web project, it fails.
 */
const assertWebRuntime: RequireWebRuntime<WebRuntimeFlag> = true;
void assertWebRuntime;

/**
 * Phase 2+ implementation target:
 * webview-side transport adapter for useChat.
 */
export interface WebTransportPlaceholder {
	readonly kind: "web-transport-placeholder";
	readonly phase: "phase-1";
}

export function createWebTransportPlaceholder(): WebTransportPlaceholder {
	return {
		kind: "web-transport-placeholder",
		phase: "phase-1",
	};
}
