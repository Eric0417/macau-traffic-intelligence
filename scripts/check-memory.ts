import { access, readFile } from "node:fs/promises";
import path from "node:path";

const _DATA_SOURCE_PATH = "docs/DATA_SOURCES.md" as const;

async function main() {
	const requiredFiles = [
		"AGENTS.md",
		"CHANGELOG.md",
		"docs/PROJECT_MEMORY.md",
		_DATA_SOURCE_PATH,
		"docs/RUNBOOK.md",
	] as const;

	const sourceIds = [
		"roads",
		"bridges",
		"cameras",
		"bus-routes",
		"parking",
		"weather",
		"notices",
		"lrt-network",
		"lrt-notices",
		"borders",
	] as const;

	for (const file of requiredFiles) {
		await access(path.join(process.cwd(), file));
	}

	const registry = await readFile(
		path.join(process.cwd(), _DATA_SOURCE_PATH),
		"utf8"
	);
	const missing = sourceIds.filter((id) => !registry.includes(`\`${id}\``));

	if (missing.length) {
		throw new Error(
			`DATA_SOURCES.md is missing source ids: ${missing.join(", ")}`
		);
	}

	console.log(
		`Memory check passed for ${requiredFiles.length} files and ${sourceIds.length} sources.`
	);
}

void main();
