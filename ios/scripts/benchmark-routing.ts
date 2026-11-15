// Offline comparison using the checked-in transport snapshots.
import { createHash } from "node:crypto";
import { planBusJourneys } from "../../src/lib/bus-journey";
import { createWalkingRouter } from "../../src/lib/walking-network";
import { busNetworkSource } from "../../src/server/sources/bus-network";
import { walkingNetworkSource } from "../../src/server/sources/walking-network";
import { placesFor } from "../../src/server/sources/journey-places";

async function main() {
  const [bus, walking] = await Promise.all([busNetworkSource.load(), walkingNetworkSource.load()]);
  const results = [];
  for (const [from, to] of [["議事亭前地", "澳門大熊貓館"], ["媽閣廟", "澳門科學館"]]) {
    const origin = placesFor(from, bus, walking)[0], destination = placesFor(to, bus, walking)[0];
    if (!origin || !destination) throw new Error("Benchmark landmark missing");
    for (const departureMinute of [180, 720]) {
      const started = performance.now();
      const router = createWalkingRouter(walking);
      const access = router(origin.coordinates), egress = router(destination.coordinates, true);
      const plans = planBusJourneys(bus, origin, destination, { departureMinute, walking: { access, egress } });
      results.push({ from, to, departureMinute, ms: Math.round(performance.now() - started),
        digest: createHash("sha256").update(JSON.stringify(plans)).digest("hex"), ids: plans.map(plan => plan.id) });
    }
  }
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
}
void main();
