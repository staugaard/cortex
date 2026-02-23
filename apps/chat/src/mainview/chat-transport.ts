import { createElectrobunChatTransport } from "@cortex/chat-core/transport-web";
import { chatRpc } from "./chat-rpc";
import type { ChatUIMessage } from "./chat-types";

export const chatTransport = createElectrobunChatTransport<ChatUIMessage>({
	sendStart: (payload) => {
		chatRpc.send.startAgentRun(payload);
	},
	sendCancel: (payload) => {
		chatRpc.send.cancelAgentRun(payload);
	},
	subscribeChunk: (handler) => {
		chatRpc.addMessageListener("agentChunk", handler);
		return () => chatRpc.removeMessageListener("agentChunk", handler);
	},
	subscribeDone: (handler) => {
		chatRpc.addMessageListener("agentDone", handler);
		return () => chatRpc.removeMessageListener("agentDone", handler);
	},
	subscribeError: (handler) => {
		chatRpc.addMessageListener("agentError", handler);
		return () => chatRpc.removeMessageListener("agentError", handler);
	},
});
