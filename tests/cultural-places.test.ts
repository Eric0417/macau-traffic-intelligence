import { expect, it } from "vitest";
import { culturalPlacesSource, culturalPlaceSchema } from "@/server/sources/cultural-places";
import walking from "../data/walking-network.json";

it("loads a dated, source-linked catalogue with valid OSM place references and opening rules", async () => {
  const places = await culturalPlacesSource.load();
  expect(places).toHaveLength(7);
  expect(new Set(places.map(p => p.id)).size).toBe(places.length);
  for (const place of places) {
    expect(walking.places.some(p => p.id === place.placeId)).toBe(true);
    expect(place.checkedAt).toBe("2026-11-14");
  }
  expect(places.find(p => p.name === "鄭家大屋")).toMatchObject({ closedDays: [3], opens: 600, closes: 1080, lastAdmission: 1050 });
  expect(places.find(p => p.name === "盧家大屋")).toMatchObject({ closedDays: [1] });
  expect(culturalPlacesSource).toMatchObject({ ttlSeconds: 86400, staleTtlSeconds: 2592000 });
  expect(culturalPlaceSchema.safeParse({ ...places[0], sourceUrl: "https://example.com" }).success).toBe(false);
});
