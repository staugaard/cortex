import { createElectrobunChatTransport } from "@cortex/chat-core/transport-web";
import { appRpc } from "./rpc";
import type { InterviewUIMessage } from "./types";

export const interviewTransport = createElectrobunChatTransport<InterviewUIMessage>({
	sendStart: (payload) => {
		appRpc.send.startAgentRun(payload);
	},
	sendCancel: (payload) => {
		appRpc.send.cancelAgentRun(payload);
	},
	subscribeChunk: (handler) => {
		appRpc.addMessageListener("agentChunk", handler);
		return () => appRpc.removeMessageListener("agentChunk", handler);
	},
	subscribeDone: (handler) => {
		appRpc.addMessageListener("agentDone", handler);
		return () => appRpc.removeMessageListener("agentDone", handler);
	},
	subscribeError: (handler) => {
		appRpc.addMessageListener("agentError", handler);
		return () => appRpc.removeMessageListener("agentError", handler);
	},
});
