#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const PROCESS_PATTERNS = [
	"bun run dev:hmr:cef",
	"bun run dev:hmr",
	"bun run dev:cef",
	"concurrently bun run hmr bun run dev:cef",
	"vite --port 5174",
	"electrobun dev",
	"/apps/template-electrobun/build/dev-macos-arm64/template-electrobun-dev.app/Contents/MacOS/bun",
];
const PORTS = [5174, 9222];

function run(command, args) {
	try {
		return execFileSync(command, args, { encoding: "utf8" }).trim();
	} catch (error) {
		const stderr =
			error && typeof error === "object" && "stderr" in error
				? String(error.stderr ?? "").trim()
				: "";
		if (stderr) {
			return stderr;
		}
		return "";
	}
}

function pidsForPattern(pattern) {
	const output = run("pgrep", ["-f", pattern]);
	if (!output) {
		return [];
	}
	return output
		.split("\n")
		.map((value) => Number.parseInt(value.trim(), 10))
		.filter((value) => Number.isFinite(value) && value > 0 && value !== process.pid);
}

function pidsForPort(port) {
	const output = run("lsof", ["-t", "-nP", `-iTCP:${port}`, "-sTCP:LISTEN"]);
	if (!output) {
		return [];
	}
	return output
		.split("\n")
		.map((value) => Number.parseInt(value.trim(), 10))
		.filter((value) => Number.isFinite(value) && value > 0 && value !== process.pid);
}

function signalPattern(pattern, signalFlag) {
	run("pkill", [signalFlag, "-f", pattern]);
}

function signalPids(pids, signalFlag) {
	for (const pid of pids) {
		run("kill", [signalFlag, String(pid)]);
	}
}

function dedupe(values) {
	return [...new Set(values)];
}

async function main() {
	console.log("[app stop] Closing Playwright CLI sessions...");
	run("playwright-cli", ["close-all"]);
	run("playwright-cli", ["kill-all"]);

	console.log("[app stop] Sending SIGINT to app dev/test processes...");
	for (const pattern of PROCESS_PATTERNS) {
		signalPattern(pattern, "-INT");
	}

	await delay(800);

	let remaining = dedupe(PROCESS_PATTERNS.flatMap((pattern) => pidsForPattern(pattern)));
	if (remaining.length > 0) {
		console.log(
			`[app stop] Escalating to SIGTERM for remaining pids: ${remaining.join(", ")}`,
		);
		for (const pattern of PROCESS_PATTERNS) {
			signalPattern(pattern, "-TERM");
		}
		await delay(600);
	}

	remaining = dedupe(PROCESS_PATTERNS.flatMap((pattern) => pidsForPattern(pattern)));
	if (remaining.length > 0) {
		console.log(
			`[app stop] Escalating to SIGKILL for remaining pids: ${remaining.join(", ")}`,
		);
		for (const pattern of PROCESS_PATTERNS) {
			signalPattern(pattern, "-KILL");
		}
		await delay(200);
	}

	remaining = dedupe(PROCESS_PATTERNS.flatMap((pattern) => pidsForPattern(pattern)));
	let portBound = dedupe(PORTS.flatMap((port) => pidsForPort(port)));
	if (portBound.length > 0) {
		console.log(
			`[app stop] Releasing bound ports (${PORTS.join(", ")}) from pids: ${portBound.join(", ")}`,
		);
		signalPids(portBound, "-INT");
		await delay(600);
	}

	portBound = dedupe(PORTS.flatMap((port) => pidsForPort(port)));
	if (portBound.length > 0) {
		signalPids(portBound, "-TERM");
		await delay(400);
	}

	portBound = dedupe(PORTS.flatMap((port) => pidsForPort(port)));
	if (portBound.length > 0) {
		signalPids(portBound, "-KILL");
		await delay(200);
	}

	remaining = dedupe(PROCESS_PATTERNS.flatMap((pattern) => pidsForPattern(pattern)));
	portBound = dedupe(PORTS.flatMap((port) => pidsForPort(port)));
	if (remaining.length > 0) {
		console.log(
			`[app stop] Some matching processes are still running: ${remaining.join(", ")}`,
		);
		process.exitCode = 1;
		return;
	}
	if (portBound.length > 0) {
		console.log(
			`[app stop] Some port-bound processes are still running: ${portBound.join(", ")}`,
		);
		process.exitCode = 1;
		return;
	}

	console.log("[app stop] Done. No matching app dev/test processes remain.");
}

void main();
