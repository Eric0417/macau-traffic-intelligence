import { access, readFile } from "node:fs/promises";
import path from "node:path";

async function main() {
  const requiredFiles = [
    "AGENTS.md",
    "CHANGELOG.md",
    "docs/PROJECT_MEMORY.md",
    "docs/DATA_SOURCES.md",
    "docs/RUNBOOK.md",
  ];

  const sourceIds = [
    "roads",
    "road-forecast",
    "bridges",
    "cameras",
    "bus-routes",
    "bus-network",
    "walking-network",
    "parking",
    "weather",
    "notices",
    "official-news",
    "lrt-network",
    "lrt-notices",
    "lrt-service",
    "borders",
  ];

  for (const file of requiredFiles) {
    await access(path.join(process.cwd(), file));
  }

  const registry = await readFile(path.join(process.cwd(), "docs/DATA_SOURCES.md"), "utf8");
  const missing = sourceIds.filter((id) => !registry.includes(`\`${id}\``));

  if (missing.length) {
    throw new Error(`DATA_SOURCES.md is missing source ids: ${missing.join(", ")}`);
  }

  console.log(
    `Memory check passed for ${requiredFiles.length} files and ${sourceIds.length} sources.`,
  );
}

void main();
