import { describe, expect, it } from "vitest";
import { predictBusArrivals, usableArrivalEstimate } from "@/lib/bus-prediction";
import type { BusEta } from "@/lib/types";
const now = Date.parse("2026-11-15T05:00:00Z");
function sample(): BusEta {
  return {
    routeCode: "00056", routeName: "56", direction: 0,
    stops: ["A", "B", "C"].map((stationCode, sequence) => ({ sequence, stationCode, stationName: stationCode, coordinates: [113.5, 22 + sequence * .01], stopsAway: sequence, trafficStatus: "normal", trafficLevel: 1, suspended: false })),
    routeSegments: [0, 1].map(i => ({ fromStationCode: ["A", "B"][i], toStationCode: ["B", "C"][i], trafficLevel: 1, trafficStatus: "normal", coordinates: [[113.5, 22 + i * .01], [113.5, 22 + (i+1) * .01]] })),
    vehicles: [{ id: "v", plate: "AA1234", busType: "1", lowFloor: false, speedKph: 20, status: "0", stationCode: "B", stationName: "B", stationSequence: 1, segmentIndex: 0, coordinates: [113.5, 22.005], bearing: 0, estimated: true, positionSource: "feed" }],
    diversion: { suspendedStops: [] },
  };
}
describe("system bus predictions", () => {
  it("computes minutes along the route, including intermediate stops", () => {
    const result = predictBusArrivals(sample(), false, now);
    expect(result.stops[1].arrivalEstimate?.minutes).toBe(2);
    expect(result.stops[2].arrivalEstimate!.minutes).toBeGreaterThan(4);
    expect(result.stops[0].arrivalEstimate).toBeNull();
  });
  it("uses outgoing geometry when the coordinate has passed the reported stop", () => {
    const data = sample(); data.vehicles[0].coordinates = [113.5, 22.015];
    const result = predictBusArrivals(data, false, now);
    expect(result.vehicles[0].segmentIndex).toBe(1);
    expect(result.stops[1].arrivalEstimate).toBeNull();
    expect(result.stops[2].arrivalEstimate?.minutes).toBe(2);
  });
  it("increases minutes and reduces extrapolation speed in congestion", () => {
    const data = sample(); data.routeSegments.forEach(s => s.trafficLevel = 4);
    const slow = predictBusArrivals(data, false, now);
    const fast = predictBusArrivals(sample(), false, now);
    expect(slow.stops[2].arrivalEstimate!.minutes).toBeGreaterThan(fast.stops[2].arrivalEstimate!.minutes);
    expect(slow.vehicles[0].prediction?.speedKph).toBe(5);
  });
  it("does not keep resetting the prediction clock on unchanged reports", () => {
    const first = predictBusArrivals(sample(), false, now);
    const next = predictBusArrivals(sample(), false, now + 31_000, first);
    expect(next.vehicles[0].predictionAnchorAt).toBe(first.vehicles[0].predictionAnchorAt);
    expect(next.vehicles[0].prediction).toBeNull();
    expect(next.stops[1].arrivalEstimate).toBeNull();
  });
  it("refreshes the anchor when a new coordinate arrives", () => {
    const first = predictBusArrivals(sample(), false, now);
    const data = sample(); data.vehicles[0].coordinates = [113.5, 22.006];
    expect(predictBusArrivals(data, false, now + 10_000, first).vehicles[0].predictionAnchorAt).toBe(new Date(now + 10_000).toISOString());
  });
  it("uses forward observed progress only when reported speed is missing", () => {
    const first = predictBusArrivals(sample(), false, now);
    const data = sample(); data.vehicles[0].coordinates = [113.5, 22.0054]; data.vehicles[0].speedKph = null;
    const result = predictBusArrivals(data, false, now + 10_000, first);
    expect(result.vehicles[0].prediction?.basis).toBe("observed-speed");
    expect(result.stops[1].arrivalEstimate).not.toBeNull();
  });
  it.each(["stopped", "no-speed", "no-position", "off-route"])("withholds movement and minutes for %s", reason => {
    const data = sample();
    if (reason === "stopped") data.vehicles[0].speedKph = 0;
    if (reason === "no-speed") data.vehicles[0].speedKph = null;
    if (reason === "no-position") data.vehicles[0].positionSource = "stop";
    if (reason === "off-route") data.vehicles[0].coordinates = [113.6, 22.02];
    const result = predictBusArrivals(data, false, now);
    expect(result.vehicles[0].prediction).toBeNull();
    expect(result.stops[1].arrivalEstimate).toBeNull();
  });
  it("does not extrapolate indefinitely, even while the response is fresh", () => {
    const result = predictBusArrivals(sample(), false, now);
    expect(Date.parse(result.vehicles[0].prediction!.validUntil)).toBe(now + 15_000);
  });
  it("withholds arrivals across a geometry gap and at suspended stops", () => {
    const data = sample(); data.routeSegments[1].coordinates[0] = [113.5, 22.012]; data.stops[1].suspended = true;
    const result = predictBusArrivals(data, false, now);
    expect(result.stops[1].arrivalEstimate).toBeNull();
    expect(result.stops[2].arrivalEstimate).toBeNull();
  });
  it("suppresses old minutes independently of a fresh cache retrieval", () => {
    const result = predictBusArrivals(sample(), false, now);
    expect(usableArrivalEstimate(result.stops[1], now + 9000)?.minutes).toBe(2);
    expect(usableArrivalEstimate(result.stops[1], now + 11_000)).toBeNull();
  });
});

it("wraps to earlier stops only for a circular route", () => {
  const data = sample();
  data.routeSegments.push({ fromStationCode: "C", toStationCode: "A", coordinates: [[113.5,22.02],[113.5,22]], trafficLevel: 1, trafficStatus: "normal" });
  data.vehicles[0].coordinates = [113.5,22.015];
  data.vehicles[0].stationCode = "C"; data.vehicles[0].segmentIndex = 1;
  expect(predictBusArrivals(data, true, now).stops[1].arrivalEstimate).not.toBeNull();
  expect(predictBusArrivals(data, false, now).stops[1].arrivalEstimate).toBeNull();
});

it("a reported zero overrides previously observed movement", () => {
  const old = predictBusArrivals(sample(), false, now);
  const data = sample(); data.vehicles[0].speedKph = 0; data.vehicles[0].coordinates = [113.5,22.006];
  const result = predictBusArrivals(data, false, now + 5000, old);
  expect(result.vehicles[0].prediction).toBeNull();
  expect(result.stops[1].arrivalEstimate).toBeNull();
});
