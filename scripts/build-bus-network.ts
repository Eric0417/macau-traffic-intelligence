import { writeFile } from "node:fs/promises";
import { collectBusNetwork } from "../src/server/sources/bus-network";
import { loadBusRoutes } from "../src/server/sources/bus";

async function main() {
  const network = await collectBusNetwork(await loadBusRoutes());
  if (network.coverage.missingRoutes.length) {
    throw new Error(`Keeping the existing snapshot: incomplete routes ${network.coverage.missingRoutes.join(", ")}`);
  }
  await writeFile(new URL("../data/bus-network.json", import.meta.url), `${JSON.stringify(network)}\n`);
  console.log(JSON.stringify({ fetchedAt: network.fetchedAt, ...network.coverage, directions: network.routes.length }));
}

void main();
