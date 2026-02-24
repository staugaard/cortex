import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const appRoot = resolve(import.meta.dirname, "..");

const requiredElementFiles = [
	"conversation.tsx",
	"message.tsx",
	"prompt-input.tsx",
	"reasoning.tsx",
	"tool.tsx",
	"confirmation.tsx",
	"snippet.tsx",
	"code-block.tsx",
	"shimmer.tsx",
	"agent.tsx",
	"task.tsx",
];

const requiredImports = [
	"@/components/ai-elements/conversation",
	"@/components/ai-elements/message",
	"@/components/ai-elements/prompt-input",
	"@/components/ai-elements/reasoning",
	"@/components/ai-elements/tool",
	"@/components/ai-elements/confirmation",
	"@/components/ai-elements/snippet",
	"@/components/ai-elements/code-block",
	"@/components/ai-elements/shimmer",
];

const requiredDocMarkers = [
	"## Docs Compliance Checklist Template",
	"## Full Elements Catalog Matrix",
	"## MUST-NOW Checklists (Completed)",
	"### Reasoning",
	"### Tool",
	"### Confirmation",
	"### Agent",
	"### Task",
];

const failures = [];

for (const file of requiredElementFiles) {
	const fullPath = resolve(
		appRoot,
		"src/mainview/components/ai-elements",
		file,
	);
	if (!existsSync(fullPath)) {
		failures.push(`Missing required ai-elements component file: ${file}`);
	}
}

const appTsxPath = resolve(appRoot, "src/mainview/App.tsx");
const appTsx = readFileSync(appTsxPath, "utf8");
const activityItemPath = resolve(
	appRoot,
	"src/mainview/components/AgentActivityItem.tsx",
);
const activityItemTsx = readFileSync(activityItemPath, "utf8");

for (const importPath of requiredImports) {
	if (!appTsx.includes(importPath)) {
		failures.push(`App.tsx missing required Elements import: ${importPath}`);
	}
}

const forbiddenPatterns = [
	/function\s+ToolPartItem\b/,
	/function\s+ReasoningPartItem\b/,
];

for (const pattern of forbiddenPatterns) {
	if (pattern.test(appTsx)) {
		failures.push(`App.tsx still includes ad-hoc renderer matching ${pattern}`);
	}
}

const requiredActivityImports = [
	"@/components/ai-elements/agent",
	"@/components/ai-elements/task",
];

for (const importPath of requiredActivityImports) {
	if (!activityItemTsx.includes(importPath)) {
		failures.push(
			`AgentActivityItem.tsx missing required Elements import: ${importPath}`,
		);
	}
}

const governanceDocPath = resolve(
	appRoot,
	"docs/ai-sdk-elements-adoption.md",
);
if (!existsSync(governanceDocPath)) {
	failures.push("Missing governance document: docs/ai-sdk-elements-adoption.md");
} else {
	const governanceDoc = readFileSync(governanceDocPath, "utf8");
	for (const marker of requiredDocMarkers) {
		if (!governanceDoc.includes(marker)) {
			failures.push(
				`Governance document missing required section marker: ${marker}`,
			);
		}
	}
}

if (failures.length > 0) {
	console.error("AI SDK Elements adoption check failed:\n");
	for (const failure of failures) {
		console.error(`- ${failure}`);
	}
	process.exit(1);
}

console.log("AI SDK Elements adoption check passed.");
