import { CHAT_CORE_RPC_PHASE, createRpcPlaceholder } from "../../src/rpc";
import { createWebTransportPlaceholder } from "../../src/transport-web";

export const webTypecheckSmoke = {
	rpcPhase: CHAT_CORE_RPC_PHASE,
	rpcPlaceholder: createRpcPlaceholder(),
	transport: createWebTransportPlaceholder(),
};
