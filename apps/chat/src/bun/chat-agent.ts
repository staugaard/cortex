import { ToolLoopAgent } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

export const CHAT_MODEL_ID = "claude-sonnet-4-6";

export const chatAgent = new ToolLoopAgent({
	model: anthropic(CHAT_MODEL_ID),
	instructions:
		"You are a concise and practical assistant embedded in a desktop kitchen-sink app for transport testing.",
});
