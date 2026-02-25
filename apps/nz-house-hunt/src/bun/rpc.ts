import { BrowserView } from "electrobun/bun";
import type { AppSchema } from "../mainview/types";
import type { ListingHunter } from "@cortex/listing-hunter/bun";
import type { RentalListing } from "./listing-schema";

export function createAppRpc(hunter: ListingHunter<RentalListing>) {
	return BrowserView.defineRPC<AppSchema>({
		handlers: {
			requests: {
				getListings: (params) =>
					hunter.listings.query(
						params.filter,
						params.limit,
						params.offset,
					),
				getListing: (params) => {
					const listing = hunter.listings.getById(params.id);
					if (!listing) throw new Error(`Listing not found: ${params.id}`);
					return listing;
				},
				rateListing: async (params) => {
					const { listing } = await hunter.rateListing(
						params.id,
						params.rating,
						params.note,
					);
					return { listing };
				},
				archiveListing: (params) => {
					hunter.listings.archive(params.id);
				},
				getDocuments: () => {
					const pref = hunter.documents.get("preference_profile");
					const cal = hunter.documents.get("calibration_log");
					return {
						preferenceProfile: pref?.content ?? null,
						calibrationLog: cal?.content ?? null,
					};
				},
				runPipeline: async () => {
					const result = await hunter.runPipeline();
					return { runId: result.runId };
				},
			},
			messages: {},
		},
	});
}
