/**
 * Electrobun RPC schema for this app.
 *
 * Shape:
 *   bun.requests    – webview can call these (request/response)
 *   bun.messages    – webview can send these (fire-and-forget)
 *   webview.requests – bun can call these (request/response)
 *   webview.messages – bun can send these (fire-and-forget)
 */
import type {
	ListingHunterBunRequests,
	ListingHunterWebviewMessages,
} from "@cortex/listing-hunter/rpc";
import type { rentalListingSchema } from "../bun/listing-schema";

export type AppSchema = {
	bun: {
		requests: ListingHunterBunRequests<typeof rentalListingSchema>;
		messages: {};
	};
	webview: {
		requests: {};
		messages: ListingHunterWebviewMessages;
	};
};
