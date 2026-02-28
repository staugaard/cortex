import { join } from "node:path";
import { BrowserWindow, Updater, Utils } from "electrobun/bun";
import { createListingHunter } from "@cortex/listing-hunter/bun";
import { createAppRpc } from "./rpc";
import { rentalListingSchema, rentalEnrichmentSchema } from "./listing-schema";
import type { RentalListing } from "./listing-schema";
import { trademeTools, extractTradeMeListings, hydrateTradeMeListing } from "./trademe-tools";
import { geocodeTools, commuteTools } from "./google-maps-tools";

const DEV_SERVER_PORT = 5174;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

// Persistent data directory outside the app bundle (same pattern as apps/chat)
const dataDir = Utils.paths.userData;

// Interview config — shared between createListingHunter and createAppRpc
const interviewHints = [
	"Ask where the user commutes to regularly (e.g. workplace, school, gym).",
	"Ask about preferred travel modes (driving, public transit, cycling, walking).",
	"Ask what time they typically commute.",
	"When the user mentions a location, use the geocodeLocation tool to resolve it to coordinates.",
	"Include the coordinates in the preference profile so the enrichment step can compute exact commute times.",
].join("\n");

const hunter = createListingHunter<RentalListing>({
	schema: rentalListingSchema,
	dbPath: join(dataDir, "nz-house-hunt.sqlite"),
	sourceTools: trademeTools,
	sourceName: "trademe",
	extract: extractTradeMeListings,
	hydrate: hydrateTradeMeListing,

	// Interview: ask about commute, geocode locations in real-time
	interviewHints,
	interviewTools: geocodeTools,

	// Enrichment: compute real commutes, describe neighbourhood
	enrichmentPrompt: [
		"Check the preference profile for commute destinations (with coordinates), travel modes, and typical commute times.",
		"For each destination, use the computeCommute tool with the listing's lat/lng as origin and the destination coordinates.",
		"Call it for each travel mode the user cares about, at the time of day they specified.",
		"Summarise all commute results in the commuteEstimate field.",
		"If no commute destinations are in the profile, set commuteEstimate to null.",
		"Describe the neighbourhood character, nearby amenities, and general vibe.",
		"Write a personalizedSummary: a concise 2-3 sentence description of the listing tailored to the user.",
		"Synthesize everything — property details, listing description, commute times, neighbourhood — against their preferences.",
		"Highlight what matches well and flag any mismatches. Write in second person ('you').",
	].join("\n"),
	enrichmentSchema: rentalEnrichmentSchema,
	enrichmentTools: commuteTools,
});

const { rpc: appRpc, closeChatDb } = createAppRpc({
	hunter,
	schema: rentalListingSchema,
	chatDbPath: join(dataDir, "interview-chat.sqlite"),
	interviewHints,
	interviewTools: geocodeTools,
});

async function getMainViewUrl(): Promise<string> {
	const channel = await Updater.localInfo.channel();
	if (channel === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
			return DEV_SERVER_URL;
		} catch {
			console.log(
				"Vite dev server not running. Run 'bun run dev:hmr' for HMR support.",
			);
		}
	}
	return "views://mainview/index.html";
}

const url = await getMainViewUrl();

const mainWindow = new BrowserWindow({
	title: "NZ House Hunt",
	url,
	rpc: appRpc,
	frame: {
		width: 1200,
		height: 800,
		x: 140,
		y: 120,
	},
});

mainWindow.on("close", () => {
	closeChatDb();
	hunter.close();
	Utils.quit();
});

console.log("App started.");
