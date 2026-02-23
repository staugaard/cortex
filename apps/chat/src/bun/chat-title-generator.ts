import { generateText, type UIMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { GenerateTitleInput } from "@cortex/chat-core/persistence";
import { CHAT_MODEL_ID } from "./chat-agent";

const TITLE_MAX_LENGTH = 72;
const TITLE_MAX_WORDS = 6;
const TITLE_STOPWORDS = new Set([
	"a",
	"an",
	"and",
	"are",
	"as",
	"at",
	"be",
	"by",
	"for",
	"from",
	"how",
	"in",
	"is",
	"it",
	"of",
	"on",
	"or",
	"that",
	"the",
	"this",
	"to",
	"with",
]);

function normalizeTitle(title: string): string | undefined {
	const normalized = title.replace(/\s+/g, " ").trim();
	if (!normalized) {
		return undefined;
	}
	return normalized.slice(0, TITLE_MAX_LENGTH);
}

function textFromMessage(message: UIMessage): string {
	const texts: string[] = [];
	for (const part of message.parts) {
		if (part.type === "text") {
			texts.push(part.text);
		}
	}
	return texts.join(" ").replace(/\s+/g, " ").trim();
}

function hasAssistantContent(messages: UIMessage[]): boolean {
	for (const message of messages) {
		if (message.role !== "assistant") {
			continue;
		}
		if (textFromMessage(message).length > 0) {
			return true;
		}
	}
	return false;
}

function toTitleToken(token: string): string {
	return token.slice(0, 1).toUpperCase() + token.slice(1).toLowerCase();
}

function textCandidates(messages: UIMessage[], fallbackTitle: string): string[] {
	const userTexts = messages
		.filter((message) => message.role === "user")
		.map(textFromMessage)
		.filter((text) => text.length > 0);
	const assistantTexts = messages
		.filter((message) => message.role === "assistant")
		.map(textFromMessage)
		.filter((text) => text.length > 0);

	return [...userTexts, ...assistantTexts, fallbackTitle];
}

function deriveDeterministicTitle(
	messages: UIMessage[],
	fallbackTitle: string,
): string | undefined {
	for (const candidate of textCandidates(messages, fallbackTitle)) {
		const tokens = candidate
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, " ")
			.split(/\s+/)
			.filter((token) => token.length > 0 && !TITLE_STOPWORDS.has(token));

		if (tokens.length >= 2) {
			return normalizeTitle(
				tokens.slice(0, TITLE_MAX_WORDS).map(toTitleToken).join(" "),
			);
		}

		if (tokens.length === 1) {
			return normalizeTitle(`${toTitleToken(tokens[0])} Chat`);
		}
	}

	return normalizeTitle(fallbackTitle);
}

function buildTitlePrompt(messages: UIMessage[]): string {
	const lines: string[] = [];
	for (const message of messages) {
		const text = textFromMessage(message);
		if (!text) {
			continue;
		}
		const role = message.role === "assistant" ? "Assistant" : "User";
		lines.push(`${role}: ${text}`);
	}

	const transcript = lines.join("\n").slice(0, 4000);
	return [
		"Return only a short conversation title.",
		"Rules:",
		"- 2 to 7 words",
		"- no quotes",
		"- no punctuation at the end",
		"- concise and specific",
		"Conversation:",
		transcript,
	].join("\n");
}

export async function generateConversationTitle(
	input: GenerateTitleInput<UIMessage>,
): Promise<string | undefined> {
	const localTitle = deriveDeterministicTitle(
		input.messages,
		input.fallbackTitle,
	);

	if (!hasAssistantContent(input.messages)) {
		return localTitle;
	}

	if (!process.env.ANTHROPIC_API_KEY) {
		return localTitle;
	}

	try {
		const { text } = await generateText({
			model: anthropic(CHAT_MODEL_ID),
			prompt: buildTitlePrompt(input.messages),
		});
		return normalizeTitle(text) ?? localTitle;
	} catch {
		return localTitle;
	}
}
