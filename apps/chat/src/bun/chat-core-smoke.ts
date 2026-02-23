import { createAgentsPlaceholder } from "@cortex/chat-core/agents";
import { createPersistencePlaceholder } from "@cortex/chat-core/persistence";
import { CHAT_CORE_RPC_PHASE } from "@cortex/chat-core/rpc";
import { createBunTransportPlaceholder } from "@cortex/chat-core/transport-bun";

export const chatCoreBunSmoke = {
	rpcPhase: CHAT_CORE_RPC_PHASE,
	transport: createBunTransportPlaceholder(),
	persistence: createPersistencePlaceholder(),
	agents: createAgentsPlaceholder(),
};
