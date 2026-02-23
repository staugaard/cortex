import { BrowserWindow, Updater, Utils } from "electrobun/bun";
import { chatRpc } from "./chat-rpc";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

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
	title: "Cortex Chat Kitchen Sink",
	url,
	rpc: chatRpc,
	frame: {
		width: 1200,
		height: 800,
		x: 140,
		y: 120,
	},
});

mainWindow.on("close", () => {
	Utils.quit();
});

console.log("Chat kitchen-sink app started.");
