import { Electroview } from "electrobun/view";
import type { AppChatSchema } from "./chat-types";

const BRIDGE_KEY = "__cortexChatElectroview";
const RPC_MAX_REQUEST_TIME_MS = 10_000;

export const chatRpc = Electroview.defineRPC<AppChatSchema>({
	maxRequestTime: RPC_MAX_REQUEST_TIME_MS,
	handlers: {
		requests: {},
		messages: {},
	},
});

export function initChatRpcBridge(): void {
	const globalRef = globalThis as Record<string, unknown>;
	if (globalRef[BRIDGE_KEY]) {
		return;
	}

	globalRef[BRIDGE_KEY] = new Electroview({ rpc: chatRpc });
}
