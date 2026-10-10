import { describe, expect, it } from "vitest";
import locationsJson from "../data/parking-locations.json";

const locations = locationsJson.locations as Record<
  string,
  { name: string; coordinates: number[] }
>;

const PREVIOUSLY_UNMATCHED = [
  "6045",
  "7095",
  "6041",
  "7051",
  "7097",
  "6005",
  "6009",
  "7059",
  "7100",
  "7101",
  "7096",
  "7099",
  "6013",
  "7069",
];

describe("parking locations", () => {
  it("covers every DSAT car park with coordinates inside Macau", () => {
    const entries = Object.values(locations);
    expect(entries).toHaveLength(92);

    for (const entry of entries) {
      expect(entry.coordinates).toHaveLength(2);
      const [longitude, latitude] = entry.coordinates;
      expect(Number.isFinite(longitude)).toBe(true);
      expect(Number.isFinite(latitude)).toBe(true);
      expect(longitude).toBeGreaterThan(113.4);
      expect(longitude).toBeLessThan(113.7);
      expect(latitude).toBeGreaterThan(22.0);
      expect(latitude).toBeLessThan(22.3);
    }
  });

  it("includes the car parks that previously had no OpenStreetMap name match", () => {
    for (const id of PREVIOUSLY_UNMATCHED) {
      expect(locations[id]?.coordinates).toBeDefined();
    }
  });
});
