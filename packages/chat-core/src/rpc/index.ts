/**
 * Phase 2+ implementation target:
 * shared RPC message contracts for chat runs and persistence.
 */
export const CHAT_CORE_RPC_PHASE = "phase-1";

export interface ChatCoreRpcPlaceholder {
	readonly phase: typeof CHAT_CORE_RPC_PHASE;
}

export function createRpcPlaceholder(): ChatCoreRpcPlaceholder {
	return { phase: CHAT_CORE_RPC_PHASE };
}
