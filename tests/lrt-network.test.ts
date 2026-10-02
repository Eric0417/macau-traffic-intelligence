import { describe, expect, it } from "vitest";
import { loadLrtNetwork } from "@/server/sources/lrt";

describe("LRT network", () => {
  it("contains the three operating lines and 15 unique stations", async () => {
    const network = await loadLrtNetwork();

    expect(network.lines.features).toHaveLength(3);
    expect(network.stations).toHaveLength(15);
    expect(network.stations.filter((station) => station.interchange)).toHaveLength(2);
  });
});
