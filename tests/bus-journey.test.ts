import { describe, expect, it } from "vitest";
import { planBusJourneys, searchBusStops, type BusNetwork, type BusJourneyRoute, type BusJourneyStop } from "@/lib/bus-journey";
import { busNetworkSchema, busNetworkSource } from "@/server/sources/bus-network";
import verifiedSnapshot from "../data/bus-network.json";

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
  it("filters both legs using the Macau departure time and ranks reviewed hours ahead of unknown hours", () => {
    const night = { ...route("N2", [stop("T"), stop("D")]), serviceWindows: [[0, 360]] as [number, number][] };
    const late = { ...route("101", [stop("A"), stop("T")]), serviceWindows: [[360, 120]] as [number, number][] };
    const unknown = route("3", [stop("A"), stop("D")]);
    const data = network([night, late, unknown]);
    expect(planBusJourneys(data, endpoint("A"), endpoint("D"), { departureMinute: 60 })
      .map((plan) => plan.legs.map((item) => item.routeName))).toEqual([["101", "N2"], ["3"]]);
    expect(planBusJourneys(data, endpoint("A"), endpoint("D"), { departureMinute: 540 })
      .map((plan) => plan.legs.map((item) => item.routeName))).toEqual([["3"]]);
  });

  it("serves the reviewed DSAT hours for all six night buses in the network snapshot", async () => {
    const data = await busNetworkSource.load();
    const night = data.routes.filter((item) => /^N[0-9]/.test(item.routeName));
    expect([...new Set(night.map((item) => item.routeName))]).toEqual(["N1A", "N1B", "N2", "N3", "N5", "N6"]);
    expect(night.every((item) => item.serviceWindows?.some(([start, end]) => start === 0 && end === 360))).toBe(true);
  });
  it("finds the published direction and counts stop edges without inventing travel minutes", () => {
    const data = network([route("3", [stop("A"), stop("B"), stop("C")])]);
    const result = planBusJourneys(data, endpoint("A"), endpoint("C"));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      accessMeters: 0, egressMeters: 0, transferMeters: 0, totalStops: 2,
      legs: [{ routeName: "3", direction: 0, from: { stationCode: "A" }, to: { stationCode: "C" }, stopCount: 2 }],
    });
    expect(planBusJourneys(data, endpoint("C"), endpoint("A"))).toEqual([]);
    expect(planBusJourneys(data, endpoint("A"), endpoint("B"))[0]?.legs[0].terminalName).toBe("C");
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

  it("orders fewer ridden stops before transfer count and deduplicates repeated boarding occurrences", () => {
    const data = network([
      route("3", [stop("A"), stop("A"), stop("B"), stop("C"), stop("D")]),
      route("8", [stop("A"), stop("T")]), route("9", [stop("T"), stop("D")]),
    ]);
    const result = planBusJourneys(data, endpoint("A"), endpoint("D"));
    expect(result[0]?.legs).toHaveLength(2);
    expect(result[0]?.totalStops).toBe(2);
    expect(result.filter((journey) => journey.legs.length === 1)).toHaveLength(1);
  });

  it("does not prefer a 35-stop circular detour over a two-stop transfer", () => {
    const detour = Array.from({ length: 34 }, (_, index) => stop(`S${index}`));
    const data = network([
      route("3", [stop("A"), ...detour, stop("D")], 0, true),
      route("8", [stop("A"), stop("T")]), route("9", [stop("T"), stop("D")]),
    ]);
    const result = planBusJourneys(data, endpoint("A"), endpoint("D"));
    expect(result[0]?.totalStops).toBe(2);
    expect(result[0]?.legs.map((item) => item.routeName)).toEqual(["8", "9"]);
    expect(result.find((item) => item.legs.length === 1)?.totalStops).toBe(35);
  });

  it("ranks the verified 9-stop transfer ahead of the 30-stop 3A loop from M138 to M263", () => {
    const result = planBusJourneys(busNetworkSchema.parse(verifiedSnapshot), endpoint("M138"), endpoint("M263"));
    expect(result[0]?.totalStops).toBe(9);
    expect(result[0]?.legs.map((item) => [item.routeName, item.fromSequence, item.toSequence])).toEqual([
      ["3A", 0, 5], ["MT5", 8, 12],
    ]);
    expect(result[0]?.legs[0].to.stationCode).toBe("M69/2");
  });

  it("searches nearby boarding and alighting platforms only when explicitly requested", () => {
    const data = network([route("3", [
      stop("A", "原定上車站", 113.54), stop("A2", "鄰近上車站", 113.541),
      stop("D", "鄰近下車站", 113.56), stop("D2", "原定目的站", 113.561),
    ])]);
    expect(planBusJourneys(data, endpoint("A"), endpoint("D2"))[0]?.totalStops).toBe(3);
    const nearby = planBusJourneys(data, endpoint("A"), endpoint("D2"), { includeNearbyStops: true });
    expect(nearby).toHaveLength(1);
    expect(nearby[0].legs[0]).toMatchObject({ from: { stationCode: "A2" }, to: { stationCode: "D" }, stopCount: 1 });
    expect(nearby[0].accessMeters).toBeGreaterThan(100);
    expect(nearby[0].egressMeters).toBeGreaterThan(100);
    expect(nearby[0].accessMeters).toBeLessThan(110);
    expect(nearby[0].egressMeters).toBeLessThan(110);
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
