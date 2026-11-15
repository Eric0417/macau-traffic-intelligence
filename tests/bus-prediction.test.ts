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
    expect(usableArrivalEstimate(result.stops[1], now - 1000)?.minutes).toBe(2);
    expect(usableArrivalEstimate(result.stops[1], now - 60_000)).toBeNull();
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


describe("arrival continuity across reports", () => {
  it("does not replace a stopped nearest bus with a later bus", () => {
    const data = sample();
    data.vehicles[0].coordinates = [113.5, 22.0095];
    data.vehicles.push({ ...data.vehicles[0], id: "later", plate: "AA9999", coordinates: [113.5, 22.001] });
    const first = predictBusArrivals(data, false, now);
    expect(first.stops[1].arrivalEstimate?.minutes).toBe(1);
    data.vehicles[0].speedKph = 0;
    const next = predictBusArrivals(data, false, now + 2000, first);
    expect(next.stops[1].arrivalEstimate).toBeNull();
    expect(next.stops[1].arrivalStatus?.vehicleId).toBe("v");
    expect(next.stops[1].arrivalStatus?.state).toBe("near-stop");
  });
  it("retains outgoing segment matching when coordinates go stale", () => {
    const data = sample(); data.vehicles[0].coordinates = [113.5, 22.015];
    const first = predictBusArrivals(data, false, now);
    const next = predictBusArrivals(data, false, now + 31_000, first);
    expect(next.vehicles[0].segmentIndex).toBe(1);
    expect(next.vehicles[0].prediction).toBeNull();
    expect(next.stops[2].arrivalStatus?.state).toBe("updating");
  });
  it("does not use a single low speed to multiply every arrival time", () => {
    const first = predictBusArrivals(sample(), false, now);
    const data = sample(); data.vehicles[0].speedKph = 1;
    const next = predictBusArrivals(data, false, now + 2000, first);
    expect(next.stops[1].arrivalEstimate!.minutes).toBeLessThanOrEqual(first.stops[1].arrivalEstimate!.minutes + 1);
  });
  it("waits for progress beyond the stop before selecting the following bus", () => {
    const data = sample(); data.vehicles[0].coordinates = [113.5, 22.00995];
    const first = predictBusArrivals(data, false, now);
    data.vehicles[0].coordinates = [113.5, 22.01005];
    const jitter = predictBusArrivals(data, false, now + 2000, first);
    expect(jitter.vehicles[0].segmentIndex).toBe(0);
    expect(jitter.stops[1].arrivalEstimate?.vehicleId).toBe("v");
  });
});

it("withholds a disappearing nearest bus briefly, then labels the replacement", () => {
  const data = sample(); data.vehicles[0].coordinates = [113.5, 22.0095];
  data.vehicles.push({ ...data.vehicles[0], id: "later", plate: "AA9999", coordinates: [113.5, 22.001] });
  const first = predictBusArrivals(data, false, now);
  data.vehicles.shift();
  const missing = predictBusArrivals(data, false, now + 2000, first);
  expect(missing.stops[1].arrivalEstimate).toBeNull();
  expect(missing.stops[1].arrivalStatus?.vehicleId).toBe("v");
  data.vehicles[0].coordinates = [113.5, 22.002];
  const later = predictBusArrivals(data, false, now + 33_000, missing);
  expect(later.stops[1].arrivalEstimate?.vehicleId).toBe("later");
  expect(later.stops[1].arrivalEstimate?.nextBus).toBe(true);
});

it("rejects a physically impossible forward jump", () => {
  const first = predictBusArrivals(sample(), false, now);
  const data = sample(); data.vehicles[0].coordinates = [113.5, 22.015];
  const next = predictBusArrivals(data, false, now + 2000, first);
  expect(next.vehicles[0].tracking?.progress).toBe(first.vehicles[0].tracking?.progress);
  expect(next.vehicles[0].prediction).toBeNull();
  expect(next.stops[1].arrivalStatus?.state).toBe("updating");
});

it("does not rewind or manufacture a new lap from a delayed position", () => {
  const first = predictBusArrivals(sample(), false, now);
  const data = sample(); data.vehicles[0].coordinates = [113.5, 22.0048];
  const next = predictBusArrivals(data, false, now + 2000, first);
  expect(next.vehicles[0].tracking?.progress).toBe(first.vehicles[0].tracking?.progress);
  expect(next.vehicles[0].tracking?.observedAt).toBe(first.vehicles[0].tracking?.observedAt);
});

it("switches buses after confirmed passage and keeps that change visible", () => {
  const data = sample(); data.vehicles[0].coordinates = [113.5, 22.00995];
  data.vehicles.push({ ...data.vehicles[0], id: "later", plate: "AA9999", coordinates: [113.5, 22.005] });
  const first = predictBusArrivals(data, false, now);
  data.vehicles[0].coordinates = [113.5, 22.0104];
  const next = predictBusArrivals(data, false, now + 6000, first);
  expect(next.stops[1].arrivalEstimate?.vehicleId).toBe("later");
  expect(next.stops[1].arrivalEstimate?.nextBus).toBe(true);
  const again = predictBusArrivals(data, false, now + 8000, next);
  expect(again.stops[1].arrivalEstimate?.nextBus).toBe(true);
});

it("does not preserve a track when route geometry or vehicle identity changes", () => {
  const first = predictBusArrivals(sample(), false, now);
  const data = sample(); data.vehicles[0].plate = "BB1234";
  expect(predictBusArrivals(data, false, now + 2000, first).vehicles[0].tracking?.startedAt).toBe(new Date(now + 2000).toISOString());
  const changed = sample(); changed.routeSegments[0].coordinates[0] = [113.5, 21.999];
  expect(predictBusArrivals(changed, false, now + 2000, first).vehicles[0].tracking?.startedAt).toBe(new Date(now + 2000).toISOString());
});

it("does not rejuvenate an unchanged coordinate after a long polling gap", () => {
  const first = predictBusArrivals(sample(), false, now);
  const next = predictBusArrivals(sample(), false, now + 120_000, first);
  expect(next.vehicles[0].prediction).toBeNull();
  expect(next.stops[1].arrivalEstimate).toBeNull();
});

it("ignores an out-of-order response without moving or refreshing its timestamps", () => {
  const first = predictBusArrivals(sample(), false, now);
  const data = sample(); data.vehicles[0].coordinates = [113.5, 22.004];
  expect(predictBusArrivals(data, false, now - 2000, first)).toEqual(first);
});

it("accepts a confirmed forward lap without jumping to a complete extra circuit", () => {
  const data = sample();
  data.routeSegments.push({ fromStationCode: "C", toStationCode: "A", coordinates: [[113.5,22.02],[113.501,22.01],[113.5,22]], trafficLevel: 1, trafficStatus: "normal" });
  data.vehicles[0].stationCode = "A"; data.vehicles[0].segmentIndex = 2;
  data.vehicles[0].coordinates = [113.500002,22.00002];
  const first = predictBusArrivals(data, true, now);
  data.vehicles[0].coordinates = [113.5,22.0004]; data.vehicles[0].segmentIndex = 0;
  const next = predictBusArrivals(data, true, now + 5000, first);
  expect(next.vehicles[0].tracking!.progress - first.vehicles[0].tracking!.progress).toBeGreaterThan(20);
  expect(next.vehicles[0].tracking!.progress - first.vehicles[0].tracking!.progress).toBeLessThan(60);
  expect(next.vehicles[0].segmentIndex).toBe(0);
});
