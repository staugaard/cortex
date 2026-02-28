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
import { createInterviewAgent, createListingChatAgent } from "@cortex/listing-hunter/bun";
import type { AppSchema, InterviewUIMessage, InterviewUIChunk } from "../mainview/types";
import type { ListingHunter } from "@cortex/listing-hunter/bun";
import type { RentalListing } from "./listing-schema";
import type { ToolSet } from "ai";

// ─── Serialization helpers ──────────────────────────────────────────────────

function serializeCompactRentalListing(l: RentalListing): Record<string, unknown> {
	return {
		id: l.id,
		title: l.title,
		suburb: l.suburb,
		rent: l.weeklyRent,
		beds: l.bedrooms,
		baths: l.bathrooms,
		type: l.propertyType,
		pets: l.petFriendly,
		parking: l.parkingSpaces,
		aiRating: l.aiRating,
		ratingNote: l.aiRatingReason?.slice(0, 80) ?? null,
		userRating: l.userRating,
		summary: l.personalizedSummary?.slice(0, 120) ?? null,
		commute: l.commuteEstimate?.slice(0, 80) ?? null,
	};
}

function serializeFullRentalListing(l: RentalListing): Record<string, unknown> {
	return {
		id: l.id,
		title: l.title,
		suburb: l.suburb,
		weeklyRent: l.weeklyRent,
		bedrooms: l.bedrooms,
		bathrooms: l.bathrooms,
		lounges: l.lounges,
		propertyType: l.propertyType,
		petFriendly: l.petFriendly,
		parkingSpaces: l.parkingSpaces,
		maxTenants: l.maxTenants,
		availableFrom: l.availableFrom instanceof Date ? l.availableFrom.toISOString() : l.availableFrom,
		sourceUrl: l.sourceUrl,
		description: l.description,
		images: l.images,
		aiRating: l.aiRating,
		aiRatingReason: l.aiRatingReason,
		userRating: l.userRating,
		userRatingNote: l.userRatingNote,
		personalizedSummary: l.personalizedSummary ?? null,
		commuteEstimate: l.commuteEstimate ?? null,
		neighbourhoodDescription: l.neighbourhoodDescription ?? null,
	};
}

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
		createUIMessageStream: async ({ chatId, messages, abortSignal }) => {
			if (chatId === "listing-chat") {
				const agent = createListingChatAgent({
					listings: options.hunter.listings,
					documents: options.hunter.documents,
					rateListing: (id, rating, note) =>
						options.hunter.rateListing(id, rating, note),
					serializeCompact: serializeCompactRentalListing,
					serializeFull: serializeFullRentalListing,
				});
				const { stream } = await createAgentLoopUIChunkStream({
					agent,
					uiMessages: messages,
					abortSignal,
				});
				return normalizeAgentUIChunkStream(stream, {
					hiddenToolNames: ["update_preference_profile"],
					hideStepLifecycleChunks: true,
				});
			}

			// Default: interview agent
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
