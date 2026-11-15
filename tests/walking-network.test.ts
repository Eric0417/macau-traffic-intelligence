import { describe, expect, it } from "vitest";
import { walkingNetworkSchema, walkingNetworkSource } from "@/server/sources/walking-network";
import { createWalkingRouter, searchJourneyPlaces, type WalkingNetwork } from "@/lib/walking-network";
import { planBusJourneys, type BusNetwork } from "@/lib/bus-journey";
import { buildJourneyMap } from "@/components/dashboard/journey-map";
import type { Coordinates } from "@/lib/resident-tools";

const a: Coordinates = [113.53, 22.19];
const b: Coordinates = [113.531, 22.19];
const bend: Coordinates = [113.531, 22.191];
const c: Coordinates = [113.532, 22.191];
const graph: WalkingNetwork = {
  mappedAt: "2026-11-09T21:22:17Z",
  places: [{ id: "a1", name: "大三巴牌坊", aliases: ["Ruínas de São Paulo"], coordinates: c, context: "" }],
  nodes: [a, b, bend, c],
  edges: [[0, 1, 1, true], [1, 2, 0, true], [2, 3, 0, true]],
};

describe("mapped walking journeys", () => {
  it("finds multilingual place names and prefers a landmark for an ambiguous prefix", () => {
    const street = { id: "w1", name: "大三巴街", aliases: [], coordinates: a, context: "", street: true };
    expect(searchJourneyPlaces(graph.places, "ruinas de sao paulo")[0].name).toBe("大三巴牌坊");
    expect(searchJourneyPlaces([street, ...graph.places], "大三巴")[0].name).toBe("大三巴牌坊");
    expect(searchJourneyPlaces([street, ...graph.places], "大三巴街")[0]).toEqual(street);
  });

  it("follows connected geometry and respects pedestrian direction in both search trees", () => {
    const route = createWalkingRouter(graph);
    const forward = route(a)(c);
    expect(forward?.coordinates).toContainEqual(bend);
    expect(forward?.meters).toBeGreaterThan(300);
    expect(route(c)(a)).toBeNull();
    expect(route(c, true)(a)).toEqual(forward);
    const inside: Coordinates = [113.5305, 22.19];
    expect(route(a)(inside)?.meters).toBeLessThan(60);
    expect(route(inside)(a)).toBeNull();
  });

  it("cannot cross disconnected paths and leaves only the mapped part solid on the map", () => {
    const route = createWalkingRouter({ ...graph, edges: [[0, 1, 0, true], [2, 3, 0, true]] });
    expect(route(a)(c)).toBeNull();
    const offset: Coordinates = [113.5305, 22.1901];
    const direct = route(offset)(b)!;
    const map = buildJourneyMap({ id: "walk", origin: offset, destination: b, legs: [], walking: { direct } });
    const path = map.collection.features.find((feature) => feature.properties?.kind === "walking-path");
    expect(path?.geometry).toEqual({ type: "LineString", coordinates: direct.coordinates });
    expect(map.collection.features.some((feature) => feature.properties?.kind === "walk")).toBe(true);
    expect(map.missingLegs).toEqual([]);
  });

  it("skips a closer but unreachable station when planning a place journey", () => {
    const near = { stationCode: "N", stationName: "Nearby disconnected", coordinates: a };
    const reachable = { stationCode: "R", stationName: "Reachable", coordinates: b };
    const destination = { stationCode: "D", stationName: "Destination", coordinates: c };
    const bus: BusNetwork = {
      fetchedAt: graph.mappedAt,
      coverage: { catalogRoutes: 2, loadedRoutes: 2, missingRoutes: [] },
      routes: [near, reachable].map((from, i) => ({
        routeCode: String(i), routeName: String(i), direction: 0, circular: false,
        company: { id: "orange", name: "澳巴", color: "orange" },
        stops: [from, destination],
      })),
    };
    const route = createWalkingRouter(graph);
    const plans = planBusJourneys(bus, { coordinates: bend }, { stationCode: "D" }, {
      walking: { access: route(bend), egress: route(c, true) },
    });
    expect(plans).toHaveLength(1);
    expect(plans[0].legs[0].from).toEqual(reachable);
    expect(plans[0].walking?.access?.coordinates.at(-1)).toEqual(b);
  });

  it("validates the bundled Macau snapshot and finds a connected route between real landmarks", async () => {
    expect(walkingNetworkSchema.safeParse({ ...graph, edges: [[0, 20, 0, true]] }).success).toBe(false);
    const data = await walkingNetworkSource.load();
    const origin = searchJourneyPlaces(data.places, "議事亭前地")[0];
    const destination = searchJourneyPlaces(data.places, "大三巴")[0];
    expect(destination.name).toBe("大三巴牌坊");
    const route = createWalkingRouter(data)(origin.coordinates)(destination.coordinates);
    expect(route?.meters).toBeGreaterThan(300);
    expect(route?.meters).toBeLessThan(900);
  });

  it("connects the park bus stop to the Panda Pavilion through the mapped unlocked gates", async () => {
    const data = await walkingNetworkSource.load();
    const pavilion = data.places.find(p => p.id === "a458587494")!;
    const route = createWalkingRouter(data)([113.55536, 22.12545])(pavilion.coordinates);
    expect(route?.meters).toBeGreaterThan(400);
    expect(route?.meters).toBeLessThan(500);
    expect(data.mappedAt).toBe("2026-11-09T21:22:17Z");
  });
});
