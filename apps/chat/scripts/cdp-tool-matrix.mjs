import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright-core";

const port = process.env.ELECTROBUN_REMOTE_DEBUG_PORT ?? "9222";
const endpoint = process.env.CDP_ENDPOINT ?? `http://127.0.0.1:${port}`;
const outputDir = resolve(
	process.cwd(),
	process.env.CDP_TOOLS_OUTPUT_DIR ?? "output/playwright/tool-matrix",
);
const timeoutMs = Number(process.env.CDP_TOOLS_TIMEOUT_MS ?? "45000");

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

async function waitForText(page, text, timeout = timeoutMs) {
	await page.waitForFunction(
		(needle) => document.body.innerText.includes(needle),
		text,
		{ timeout },
	);
}

async function waitForTexts(page, texts, timeout = timeoutMs) {
	const start = Date.now();
	for (const text of texts) {
		const elapsed = Date.now() - start;
		const remaining = Math.max(500, timeout - elapsed);
		await waitForText(page, text, remaining);
	}
}

async function waitForReadyStatus(page, timeout = timeoutMs) {
	await page.waitForFunction(() => {
		const diagnostics = Array.from(document.querySelectorAll("aside")).find(
			(node) => (node.textContent ?? "").includes("Diagnostics"),
		);
		if (!diagnostics) {
			return true;
		}
		const normalized = (diagnostics.textContent ?? "")
			.replace(/\s+/g, " ")
			.toLowerCase();
		return normalized.includes("status ready");
	}, { timeout });
}

async function assertNoUnexpectedAppErrors(page, contextLabel) {
	const snapshot = await page.evaluate(() => {
		const bodyText = document.body.innerText;
		const diagnostics = Array.from(document.querySelectorAll("aside")).find(
			(node) => (node.textContent ?? "").includes("Diagnostics"),
		);
		const diagnosticsText = diagnostics?.textContent ?? "";
		return {
			bodyText,
			diagnosticsText,
		};
	});

	const toastTitles = ["Chat Error", "Save Error", "Load Error"];
	for (const title of toastTitles) {
		assertCondition(
			!snapshot.bodyText.includes(title),
			`${contextLabel}: unexpected toast "${title}" detected.`,
		);
	}

	const normalizedDiagnostics = snapshot.diagnosticsText
		.replace(/\s+/g, " ")
		.toLowerCase();
	assertCondition(
		!normalizedDiagnostics.includes("status error"),
		`${contextLabel}: diagnostics status is error.`,
	);
}

async function sendPrompt(page, prompt) {
	const input = page.locator('textarea[placeholder="Message..."]');
	await input.fill(prompt);
	await page.keyboard.press("Enter");
}

async function saveShot(page, name) {
	const screenshotPath = resolve(outputDir, name);
	await mkdir(dirname(screenshotPath), { recursive: true });
	await page.screenshot({
		path: screenshotPath,
		fullPage: true,
	});
	return screenshotPath;
}

function assertCondition(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

const browser = await chromium.connectOverCDP(endpoint);

try {
	const page = getFirstPage(browser);
	if (!page) {
		throw new Error(
			`No pages found on CDP endpoint ${endpoint}. Start bun run dev:hmr:cef first.`,
		);
	}

	await page.bringToFront();
	await page.waitForSelector('textarea[placeholder="Message..."]', {
		timeout: timeoutMs,
	});
	await waitForReadyStatus(page);
	await assertNoUnexpectedAppErrors(page, "initial-load");

	const newChatButton = page.locator('button:has-text("New Chat")').first();
	if ((await newChatButton.count()) > 0) {
		await newChatButton.click();
	}
	await waitForReadyStatus(page);
	await assertNoUnexpectedAppErrors(page, "after-new-chat");

	await sendPrompt(
		page,
		'Use get_local_time with timezone "Europe/Copenhagen" and report the result.',
	);
	await waitForTexts(page, ["Tool: get_local_time", "output-available"]);
	await waitForReadyStatus(page);
	await assertNoUnexpectedAppErrors(page, "get_local_time");
	const shot1 = await saveShot(page, "01-root-get-local-time.png");

	await sendPrompt(
		page,
		'Call always_fail_for_test with reason "smoke".',
	);
	await waitForTexts(page, ["Tool: always_fail_for_test", "output-error"]);
	await waitForReadyStatus(page);
	await assertNoUnexpectedAppErrors(page, "always_fail_for_test");
	const shot2 = await saveShot(page, "02-root-fail-tool.png");

	await sendPrompt(page, "What is 12.5 * (8 - 3)?");
	await waitForText(page, "Agent");
	const latestAgentSummary = page.locator("details summary").last();
	if ((await latestAgentSummary.count()) > 0) {
		await latestAgentSummary.click();
	}
	await waitForText(page, "solve_arithmetic");
	const pageTextAfterMath = await page.evaluate(() => document.body.innerText);
	assertCondition(
		!pageTextAfterMath.includes("Tool: ask_math_expert"),
		'Unexpected root tool card rendered for internal tool "ask_math_expert".',
	);
	await waitForReadyStatus(page);
	await assertNoUnexpectedAppErrors(page, "solve_arithmetic");
	const shot3 = await saveShot(page, "03-subagent-solve-arithmetic.png");

	await sendPrompt(
		page,
		"Preview deleting prod invoices using sensitive_action_preview.",
	);
	await waitForTexts(page, ["Tool: sensitive_action_preview", "approval-requested"]);
	const denyButton = page.locator('[data-testid="tool-deny-button"]').last();
	await denyButton.click();
	await waitForText(page, "output-denied");
	await waitForReadyStatus(page);
	await assertNoUnexpectedAppErrors(page, "sensitive_action_preview deny");
	const shot4 = await saveShot(page, "04-approval-denied.png");

	await sendPrompt(
		page,
		"Preview deleting prod invoices using sensitive_action_preview again.",
	);
	await waitForTexts(page, ["Tool: sensitive_action_preview", "approval-requested"]);
	const approveButton = page.locator('[data-testid="tool-approve-button"]').last();
	await approveButton.click();
	await waitForText(page, "output-available");
	await waitForReadyStatus(page);
	await assertNoUnexpectedAppErrors(page, "sensitive_action_preview approve");
	const shot5 = await saveShot(page, "05-approval-approved.png");

	console.log(`CDP attached to: ${page.url()}`);
	console.log("Tool matrix checks passed.");
	console.log(`Screenshot saved: ${shot1}`);
	console.log(`Screenshot saved: ${shot2}`);
	console.log(`Screenshot saved: ${shot3}`);
	console.log(`Screenshot saved: ${shot4}`);
	console.log(`Screenshot saved: ${shot5}`);
} finally {
	await browser.close();
}
