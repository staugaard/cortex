import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const targets = [
	join(root, "package.json"),
	join(root, "src"),
	join(root, "tests"),
];
const legacyRendererPackage = ["react", "test", "renderer"].join("-");
const legacyRendererTypesPackage = `@types/${legacyRendererPackage}`;
const bannedPatterns = [legacyRendererPackage, legacyRendererTypesPackage];
const textExtensions = new Set([
	".json",
	".js",
	".mjs",
	".cjs",
	".ts",
	".tsx",
	".md",
]);

function walk(path) {
	const stats = statSync(path);
	if (stats.isDirectory()) {
		const entries = readdirSync(path);
		return entries.flatMap((entry) => walk(join(path, entry)));
	}
	return [path];
}

const files = targets.flatMap((target) => walk(target));
const offenders = [];

for (const file of files) {
	const extension = extname(file);
	if (!textExtensions.has(extension)) {
		continue;
	}

	const content = readFileSync(file, "utf8");
	for (const pattern of bannedPatterns) {
		if (content.includes(pattern)) {
			offenders.push({
				file: file.replace(`${root}/`, ""),
				pattern,
			});
		}
	}
}

if (offenders.length > 0) {
	console.error("Legacy renderer usage detected in chat-core:");
	for (const offender of offenders) {
		console.error(`- ${offender.file} contains "${offender.pattern}"`);
	}
	process.exit(1);
}

console.log("No legacy renderer package usage found in chat-core.");
