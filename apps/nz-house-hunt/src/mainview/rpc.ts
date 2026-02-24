import { Electroview } from "electrobun/view";
import type { AppSchema } from "./types";

const BRIDGE_KEY = "__appElectroview";
const RPC_MAX_REQUEST_TIME_MS = 10_000;

export const appRpc = Electroview.defineRPC<AppSchema>({
	maxRequestTime: RPC_MAX_REQUEST_TIME_MS,
	handlers: {
		requests: {},
		messages: {},
	},
});

export function initRpcBridge(): void {
	const globalRef = globalThis as Record<string, unknown>;
	if (globalRef[BRIDGE_KEY]) {
		return;
	}

	globalRef[BRIDGE_KEY] = new Electroview({ rpc: appRpc });
}
