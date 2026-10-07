import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildLrtNetwork,
  fetchLrtNetworkFromOverpass,
  isUsableLrtNetwork,
  lrtNetworkFallback,
} from "../src/server/sources/lrt-network";

async function main() {
  const network = process.env.OVERPASS_INPUT
    ? buildLrtNetwork(
        JSON.parse(await readFile(process.env.OVERPASS_INPUT, "utf8")),
        lrtNetworkFallback,
      )
    : await fetchLrtNetworkFromOverpass();
  if (!isUsableLrtNetwork(network)) {
    throw new Error("Overpass response did not contain the full LRT network");
  }

  const target = path.join(process.cwd(), "data", "lrt-network.json");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(network, null, 2)}\n`, "utf8");
  console.log(
    `Wrote ${network.lines.features.length} lines and ${network.stations.length} stations to ${target}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
