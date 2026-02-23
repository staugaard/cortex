import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright-core";

const port = process.env.ELECTROBUN_REMOTE_DEBUG_PORT ?? "9222";
const endpoint = process.env.CDP_ENDPOINT ?? `http://127.0.0.1:${port}`;
const screenshotPath = resolve(
	process.cwd(),
	process.env.CDP_SCREENSHOT ?? "output/playwright/cdp-chat.png",
);
const prompt = process.env.CDP_PROMPT?.trim();
const waitMs = Number(process.env.CDP_WAIT_MS ?? "1000");
const assistantWaitMs = Number(process.env.CDP_ASSISTANT_WAIT_MS ?? "20000");

function isPositiveFiniteNumber(value) {
	return Number.isFinite(value) && value > 0;
}

function getFirstPage(browser) {
	for (const context of browser.contexts()) {
		const pages = context.pages();
		const appPage = pages.find((page) => page.url().includes("localhost:5174"));
		if (appPage) {
			return appPage;
		}
		if (pages.length > 0) {
			return pages[0];
		}
	}
	return null;
}

function toMessageCounts() {
	const messages = Array.from(document.querySelectorAll('[data-testid="chat-message"]'));
	const assistantCount = messages.filter(
		(el) => el.dataset.role === "assistant",
	).length;

	return {
		total: messages.length,
		assistant: assistantCount,
	};
}

function getLastAssistantText() {
	const messages = Array.from(document.querySelectorAll('[data-testid="chat-message"][data-role="assistant"]'));
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const text = messages[index].innerText?.trim() ?? "";
		if (text.length > 0) {
			return text;
		}
	}

	return null;
}

const browser = await chromium.connectOverCDP(endpoint);

try {
	const page = getFirstPage(browser);
	if (!page) {
		throw new Error(
			`No pages were found on CDP endpoint ${endpoint}. Start the app with bun run dev:hmr:cef first.`,
		);
	}

	await page.bringToFront();
	await page.waitForSelector('textarea[placeholder="Message..."]', {
		timeout: 15000,
	});

	if (prompt && prompt.length > 0) {
		const beforeCounts = await page.evaluate(toMessageCounts);
		const input = page.locator('textarea[placeholder="Message..."]');
		await input.fill(prompt);
		await page.keyboard.press("Enter");

		if (isPositiveFiniteNumber(assistantWaitMs)) {
			await page
				.waitForFunction(
					(previousAssistantCount) => {
						const messages = Array.from(document.querySelectorAll('[data-testid="chat-message"]'));
						const assistantCount = messages.filter(
							(el) => el.dataset.role === "assistant",
						).length;

						return assistantCount > previousAssistantCount;
					},
					beforeCounts.assistant,
					{ timeout: assistantWaitMs },
				)
				.catch(() => {});
		}
	}

	if (isPositiveFiniteNumber(waitMs)) {
		await page.waitForTimeout(waitMs);
	}

	await mkdir(dirname(screenshotPath), { recursive: true });
	await page.screenshot({
		path: screenshotPath,
		fullPage: true,
	});

	console.log(`CDP attached to: ${page.url()}`);
	const lastAssistantText = await page.evaluate(getLastAssistantText);
	if (lastAssistantText) {
		console.log(
			`Last assistant message: ${lastAssistantText.slice(0, 280).replaceAll("\\n", " ")}`,
		);
	}
	console.log(`Screenshot saved: ${screenshotPath}`);
} finally {
	await browser.close();
}
