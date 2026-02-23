import { ToolLoopAgent } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

const modelId = "claude-sonnet-4-6";

export const chatAgent = new ToolLoopAgent({
	model: anthropic(modelId),
	instructions:
		"You are a concise and practical assistant embedded in a desktop kitchen-sink app for transport testing.",
});
