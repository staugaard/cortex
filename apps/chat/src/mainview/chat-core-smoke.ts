import { CHAT_CORE_RPC_PHASE } from "@cortex/chat-core/rpc";
import { createWebTransportPlaceholder } from "@cortex/chat-core/transport-web";

export const chatCoreWebSmoke = {
	rpcPhase: CHAT_CORE_RPC_PHASE,
	transport: createWebTransportPlaceholder(),
};
