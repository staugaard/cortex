/**
 * Electrobun RPC schema for this app.
 *
 * Shape:
 *   bun.requests    – webview can call these (request/response)
 *   bun.messages    – webview can send these (fire-and-forget)
 *   webview.requests – bun can call these (request/response)
 *   webview.messages – bun can send these (fire-and-forget)
 */
import type { UIMessage, UIMessageChunk } from "ai";
import type {
	ListingHunterBunRequests,
	ListingHunterWebviewMessages,
} from "@cortex/listing-hunter/rpc";
import type {
	StartAgentRunMessage,
	CancelAgentRunMessage,
	AgentChunkMessage,
	AgentDoneMessage,
	AgentErrorMessage,
	GetConversationRequest,
	GetConversationResponse,
	SaveMessagesRequest,
	SaveMessagesResponse,
} from "@cortex/chat-core/rpc";
import type { rentalListingSchema } from "../bun/listing-schema";

export type InterviewUIMessage = UIMessage;
export type InterviewUIChunk = UIMessageChunk;

export type AppSchema = {
	bun: {
		requests: ListingHunterBunRequests<typeof rentalListingSchema> & {
			getConversation: {
				params: GetConversationRequest;
				response: GetConversationResponse<InterviewUIMessage>;
			};
			saveMessages: {
				params: SaveMessagesRequest<InterviewUIMessage>;
				response: SaveMessagesResponse;
			};
			hasPreferenceProfile: {
				params: void;
				response: { exists: boolean };
			};
		};
		messages: {
			startAgentRun: StartAgentRunMessage<InterviewUIMessage>;
			cancelAgentRun: CancelAgentRunMessage;
		};
	};
	webview: {
		requests: {};
		messages: ListingHunterWebviewMessages & {
			agentChunk: AgentChunkMessage<InterviewUIChunk>;
			agentDone: AgentDoneMessage;
			agentError: AgentErrorMessage;
		};
	};
};
