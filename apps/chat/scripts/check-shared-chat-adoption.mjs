import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const appRoot = resolve(import.meta.dirname, "..");
const appTsxPath = resolve(appRoot, "src/mainview/App.tsx");
const appTsx = readFileSync(appTsxPath, "utf8");

const failures = [];

if (!appTsx.includes("@cortex/chat-core/react")) {
	failures.push("App.tsx must import from @cortex/chat-core/react.");
}

if (!appTsx.includes("ChatConversation")) {
	failures.push("App.tsx must use ChatConversation from @cortex/chat-core/react.");
}

if (!appTsx.includes("useChatSessions")) {
	failures.push("App.tsx must use useChatSessions from @cortex/chat-core/react.");
}

if (/from\s+["']@ai-sdk\/react["']/.test(appTsx)) {
	failures.push("App.tsx must not import useChat directly from @ai-sdk/react.");
}

const removedPaths = [
	"src/mainview/components/ai-elements",
	"src/mainview/components/ui",
	"src/mainview/components/AgentActivityItem.tsx",
	"src/mainview/components/DiagnosticsPanel.tsx",
	"src/mainview/components/ErrorToasts.tsx",
	"src/mainview/lib/utils.ts",
	"components.json",
	"docs/ai-sdk-elements-adoption.md",
];

for (const target of removedPaths) {
	if (existsSync(resolve(appRoot, target))) {
		failures.push(`Legacy path should be removed: ${target}`);
	}
}

if (failures.length > 0) {
	console.error("Shared chat adoption check failed:\n");
	for (const failure of failures) {
		console.error(`- ${failure}`);
	}
	process.exit(1);
}

console.log("Shared chat adoption check passed.");
