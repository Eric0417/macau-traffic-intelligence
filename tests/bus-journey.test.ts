import { describe, expect, it } from "vitest";
import { planBusJourneys, searchBusStops, type BusNetwork, type BusJourneyRoute, type BusJourneyStop } from "@/lib/bus-journey";

const stop = (stationCode: string, stationName = stationCode, longitude = 113.54): BusJourneyStop => ({
  stationCode, stationName, coordinates: [longitude, 22.19],
});
const route = (routeName: string, stops: BusJourneyStop[], direction: 0 | 1 = 0, circular = false): BusJourneyRoute => ({
  routeName, routeCode: routeName.padStart(5, "0"), direction, circular,
  company: { id: "orange", name: "澳巴", color: "orange" }, stops,
});
const network = (routes: BusJourneyRoute[]): BusNetwork => ({
  routes, fetchedAt: "2026-11-10T10:00:00.000Z",
  coverage: { catalogRoutes: routes.length, loadedRoutes: routes.length, missingRoutes: [] },
});
const endpoint = (stationCode: string) => ({ stationCode });

describe("local bus journey search", () => {
  it("finds the published direction and counts stop edges without inventing travel minutes", () => {
    const data = network([route("3", [stop("A"), stop("B"), stop("C")])]);
    const result = planBusJourneys(data, endpoint("A"), endpoint("C"));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      accessMeters: 0, egressMeters: 0, transferMeters: 0, totalStops: 2,
      legs: [{ routeName: "3", direction: 0, from: { stationCode: "A" }, to: { stationCode: "C" }, stopCount: 2 }],
    });
    expect(planBusJourneys(data, endpoint("C"), endpoint("A"))).toEqual([]);
  });

  it("uses later repeated stops on a circular route without continuing through the terminal", () => {
    const data = network([route("2A", [stop("A"), stop("B"), stop("C"), stop("B"), stop("A")], 0, true)]);
    expect(planBusJourneys(data, endpoint("C"), endpoint("B"))[0]?.totalStops).toBe(1);
    expect(planBusJourneys(data, endpoint("C"), endpoint("B"))[0]?.legs[0]).toMatchObject({ fromSequence: 2, toSequence: 3 });
    expect(planBusJourneys(data, endpoint("B"), endpoint("A"))[0]?.totalStops).toBe(1);
    const noWrap = network([route("2A", [stop("A"), stop("B"), stop("C")], 0, true)]);
    expect(planBusJourneys(noWrap, endpoint("C"), endpoint("B"))).toEqual([]);
  });

  it("finds one transfer at the identical official station code, including opposite route directions", () => {
    const data = network([
      route("3", [stop("A"), stop("T"), stop("X")]),
      route("8", [stop("T"), stop("D")], 1),
    ]);
    const result = planBusJourneys(data, endpoint("A"), endpoint("D"));
    expect(result[0]?.legs.map((leg) => [leg.routeName, leg.direction, leg.from.stationCode, leg.to.stationCode])).toEqual([
      ["3", 0, "A", "T"], ["8", 1, "T", "D"],
    ]);
    expect(result[0]?.totalStops).toBe(2);
  });

  it("does not invent a walk between neighbouring platforms or a second transfer", () => {
    const nearbyPlatforms = network([
      route("3", [stop("A"), stop("T/1")]), route("8", [stop("T/2"), stop("D")]),
    ]);
    expect(planBusJourneys(nearbyPlatforms, endpoint("A"), endpoint("D"))).toEqual([]);
    const threeBuses = network([
      route("3", [stop("A"), stop("T")]), route("8", [stop("T"), stop("U")]), route("9", [stop("U"), stop("D")]),
    ]);
    expect(planBusJourneys(threeBuses, endpoint("A"), endpoint("D"))).toEqual([]);
  });

  it("limits private-location access to nearby stops and returns only straight-line distance", () => {
    const data = network([route("3", [stop("A", "出發站", 113.541), stop("D", "目的站", 113.56)])]);
    const result = planBusJourneys(data, { coordinates: [113.54, 22.19] }, endpoint("D"));
    expect(result[0]?.accessMeters).toBeGreaterThan(100);
    expect(result[0]?.accessMeters).toBeLessThan(110);
    expect(planBusJourneys(data, { coordinates: [113.50, 22.19] }, endpoint("D"))).toEqual([]);
  });

  it("orders fewer transfers before stop count and deduplicates repeated boarding occurrences", () => {
    const data = network([
      route("3", [stop("A"), stop("A"), stop("B"), stop("C"), stop("D")]),
      route("8", [stop("A"), stop("T")]), route("9", [stop("T"), stop("D")]),
    ]);
    const result = planBusJourneys(data, endpoint("A"), endpoint("D"));
    expect(result[0]?.legs).toHaveLength(1);
    expect(result[0]?.totalStops).toBe(3);
    expect(result.filter((journey) => journey.legs.length === 1)).toHaveLength(1);
  });

  it("keeps distinct bus combinations instead of filling results with equivalent transfer stations", () => {
    const data = network([
      route("3", [stop("A"), stop("T1"), stop("T2"), stop("X")]),
      route("1", [stop("T1"), stop("T2"), stop("D")]),
      route("3X", [stop("A"), stop("T1")]),
    ]);
    const result = planBusJourneys(data, endpoint("A"), endpoint("D"));
    expect(result).toHaveLength(2);
    expect(result.map((journey) => journey.legs.map((item) => item.routeName))).toEqual([["3", "1"], ["3X", "1"]]);
    expect(result[0].legs[0].to.stationCode).toBe("T1");
    expect(result[0].totalStops).toBe(3);
  });

  it("considers every stop within the access range, including a ninth candidate", () => {
    const nearby = Array.from({ length: 8 }, (_, index) => stop(`N${index}`, `鄰近站${index}`, 113.54 + index * .0001));
    const data = network([
      ...nearby.map((item, index) => route(String(index + 10), [item, stop(`Z${index}`, "其他終點", 113.6)])),
      route("3", [stop("N9", "第九近站", 113.541), stop("D", "目的站", 113.56)]),
    ]);
    expect(planBusJourneys(data, { coordinates: [113.54, 22.19] }, endpoint("D"))[0]?.legs[0].routeName).toBe("3");
  });

  it("searches official stop names and exact platform codes without collapsing them", () => {
    const data = network([route("3", [stop("M1/1", "關閘總站"), stop("M1/2", "關閘總站"), stop("M2", "南灣")])]);
    expect(searchBusStops(data, "關閘").map((item) => item.stationCode)).toEqual(["M1/1", "M1/2"]);
    expect(searchBusStops(data, "m1/2").map((item) => item.stationCode)).toEqual(["M1/2"]);
    expect(searchBusStops(data, "未知地點")).toEqual([]);
  });
});
