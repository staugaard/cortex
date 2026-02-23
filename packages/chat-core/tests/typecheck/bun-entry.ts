import { createAgentsPlaceholder } from "../../src/agents";
import { createPersistencePlaceholder } from "../../src/persistence";
import { CHAT_CORE_RPC_PHASE, createRpcPlaceholder } from "../../src/rpc";
import { createBunTransportPlaceholder } from "../../src/transport-bun";

export const bunTypecheckSmoke = {
	rpcPhase: CHAT_CORE_RPC_PHASE,
	rpcPlaceholder: createRpcPlaceholder(),
	transport: createBunTransportPlaceholder(),
	persistence: createPersistencePlaceholder(),
	agents: createAgentsPlaceholder(),
};
