import { BrowserView } from "electrobun/bun";
import type { ZodObject, ZodRawShape } from "zod";
import {
	createBunChatRunController,
	handleStartAgentRun,
	handleCancelAgentRun,
} from "@cortex/chat-core/transport-bun";
import { createSqliteChatRepository } from "@cortex/chat-core/persistence";
import {
	createAgentLoopUIChunkStream,
	normalizeAgentUIChunkStream,
} from "@cortex/chat-core/agents";
import { createInterviewAgent } from "@cortex/listing-hunter/bun";
import type { AppSchema, InterviewUIMessage, InterviewUIChunk } from "../mainview/types";
import type { ListingHunter } from "@cortex/listing-hunter/bun";
import type { RentalListing } from "./listing-schema";
import type { ToolSet } from "ai";

export function createAppRpc(options: {
	hunter: ListingHunter<RentalListing>;
	schema: ZodObject<ZodRawShape>;
	chatDbPath: string;
	interviewHints?: string;
	interviewTools?: ToolSet;
}) {
	const chatRepository = createSqliteChatRepository<InterviewUIMessage>({
		dbPath: options.chatDbPath,
	});

	const runController = createBunChatRunController<InterviewUIMessage, InterviewUIChunk>({
		createUIMessageStream: async ({ messages, abortSignal }) => {
			const agent = createInterviewAgent({
				schema: options.schema,
				documents: options.hunter.documents,
				interviewHints: options.interviewHints,
				interviewTools: options.interviewTools,
			});
			const { stream } = await createAgentLoopUIChunkStream({
				agent,
				uiMessages: messages,
				abortSignal,
			});
			return normalizeAgentUIChunkStream(stream, {
				hiddenToolNames: ["save_preference_profile"],
				hideStepLifecycleChunks: true,
			});
		},
		sendChunk: (payload) => appRpc.send.agentChunk(payload),
		sendDone: (payload) => appRpc.send.agentDone(payload),
		sendError: (payload) => appRpc.send.agentError(payload),
	});

	const appRpc = BrowserView.defineRPC<AppSchema>({
		handlers: {
			requests: {
				getListings: (params) =>
					options.hunter.listings.query(
						params.filter,
						params.sort,
						params.limit,
						params.offset,
					),
				getListing: (params) => {
					const listing = options.hunter.listings.getById(params.id);
					if (!listing) throw new Error(`Listing not found: ${params.id}`);
					return listing;
				},
				rateListing: async (params) => {
					const { listing } = await options.hunter.rateListing(
						params.id,
						params.rating,
						params.note,
					);
					return { listing };
				},
				archiveListing: (params) => {
					options.hunter.listings.archive(params.id);
				},
				getDocuments: () => {
					const pref = options.hunter.documents.get("preference_profile");
					const cal = options.hunter.documents.get("calibration_log");
					return {
						preferenceProfile: pref?.content ?? null,
						calibrationLog: cal?.content ?? null,
					};
				},
				runPipeline: async () => {
					const result = await options.hunter.runPipeline();
					return { runId: result.runId };
				},
				getConversation: (params) => chatRepository.getConversation(params),
				saveMessages: (params) => chatRepository.saveMessages(params),
				hasPreferenceProfile: () => ({
					exists: options.hunter.documents.get("preference_profile") !== null,
				}),
			},
			messages: {
				startAgentRun: (payload) => handleStartAgentRun(runController, payload),
				cancelAgentRun: (payload) => handleCancelAgentRun(runController, payload),
			},
		},
	});

	return { rpc: appRpc, closeChatDb: () => chatRepository.close() };
}
