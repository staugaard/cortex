import { Electroview } from "electrobun/view";
import type { AppSchema } from "./types";

const BRIDGE_KEY = "__appElectroview";
const RPC_MAX_REQUEST_TIME_MS = 120_000;

export const appRpc = Electroview.defineRPC<AppSchema>({
	maxRequestTime: RPC_MAX_REQUEST_TIME_MS,
	handlers: {
		requests: {},
		messages: {
			listingsUpdated: (payload) => {
				console.log(`Pipeline found ${payload.newCount} new listings`);
			},
			pipelineStatus: (payload) => {
				console.log(
					`Pipeline ${payload.runId}: ${payload.status}`,
					payload.stats,
				);
			},
			documentsUpdated: (payload) => {
				console.log(`Document updated: ${payload.type}`);
			},
			agentChunk: () => {},
			agentDone: () => {},
			agentError: () => {},
		},
	},
});

export function initRpcBridge(): void {
	const globalRef = globalThis as Record<string, unknown>;
	if (globalRef[BRIDGE_KEY]) {
		return;
	}

	globalRef[BRIDGE_KEY] = new Electroview({ rpc: appRpc });
}
