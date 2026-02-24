import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright-core";

const port = process.env.ELECTROBUN_REMOTE_DEBUG_PORT ?? "9222";
const endpoint = process.env.CDP_ENDPOINT ?? `http://127.0.0.1:${port}`;
const screenshotPath = resolve(
	process.cwd(),
	process.env.CDP_SCREENSHOT ?? "output/playwright/screenshot.png",
);
const waitMs = Number(process.env.CDP_WAIT_MS ?? "1000");

function getFirstPage(browser) {
	for (const context of browser.contexts()) {
		const pages = context.pages();
		const appPage = pages.find((page) =>
			page.url().includes("localhost:5174"),
		);
		if (appPage) {
			return appPage;
		}
		if (pages.length > 0) {
			return pages[0];
		}
	}
	return null;
}

const browser = await chromium.connectOverCDP(endpoint);

try {
	const page = getFirstPage(browser);
	if (!page) {
		throw new Error(
			`No pages found on CDP endpoint ${endpoint}. Start the app with bun run dev:hmr:cef first.`,
		);
	}

	await page.bringToFront();

	if (Number.isFinite(waitMs) && waitMs > 0) {
		await page.waitForTimeout(waitMs);
	}

	await mkdir(dirname(screenshotPath), { recursive: true });
	await page.screenshot({
		path: screenshotPath,
		fullPage: true,
	});

	console.log(`CDP attached to: ${page.url()}`);
	console.log(`Screenshot saved: ${screenshotPath}`);
} finally {
	await browser.close();
}
