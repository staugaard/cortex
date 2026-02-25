import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { RatingOverrideRecord } from "./rating-override-repository.js";

export type CalibrateFn = (
	overrides: RatingOverrideRecord[],
	currentCalibrationLog: string | null,
	preferenceProfile: string | null,
) => Promise<string>;

const CALIBRATION_MODEL_ID = "claude-sonnet-4-6";

function buildSystemPrompt(
	currentCalibrationLog: string | null,
	preferenceProfile: string | null,
): string {
	const modeInstruction = currentCalibrationLog?.trim().length
		? "Update and refine the existing calibration log with new patterns."
		: "Create an initial calibration log from scratch.";

	return [
		"You synthesize preference calibration notes from AI-vs-user rating overrides.",
		"Identify recurring mismatch patterns and translate them into practical rating guidance.",
		"Keep output concise and actionable.",
		modeInstruction,
		"",
		"Include:",
		"- observed mismatch patterns",
		"- corrected preference signals",
		"- concrete guidance for future 1-5 ratings",
		"",
		"## Stated preference profile",
		preferenceProfile?.trim().length
			? preferenceProfile
			: "No explicit preference profile is available.",
		"",
		"## Existing calibration log",
		currentCalibrationLog?.trim().length
			? currentCalibrationLog
			: "No existing calibration log.",
	].join("\n");
}

export const synthesizeCalibration: CalibrateFn = async (
	overrides,
	currentCalibrationLog,
	preferenceProfile,
) => {
	const { text } = await generateText({
		model: anthropic(CALIBRATION_MODEL_ID),
		system: buildSystemPrompt(currentCalibrationLog, preferenceProfile),
		prompt: `Rating overrides (most recent first):\n${JSON.stringify(overrides, null, 2)}`,
	});

	const calibrationLog = text.trim();
	if (calibrationLog.length === 0) {
		throw new Error("Calibration agent returned empty output");
	}

	return calibrationLog;
};
