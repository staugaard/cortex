import { join } from "node:path";
import { BrowserWindow, Updater, Utils } from "electrobun/bun";
import { createListingHunter } from "@cortex/listing-hunter/bun";
import { createAppRpc } from "./rpc";
import { rentalListingSchema } from "./listing-schema";
import type { RentalListing } from "./listing-schema";
import { trademeTools } from "./trademe-tools";

const DEV_SERVER_PORT = 5174;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

// Persistent data directory outside the app bundle (same pattern as apps/chat)
const dataDir = Utils.paths.userData;

const hunter = createListingHunter<RentalListing>({
	schema: rentalListingSchema,
	dbPath: join(dataDir, "nz-house-hunt.sqlite"),
	sourceTools: trademeTools,
	sourceName: "trademe",
});

const { rpc: appRpc, closeChatDb } = createAppRpc({
	hunter,
	schema: rentalListingSchema,
	chatDbPath: join(dataDir, "interview-chat.sqlite"),
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
