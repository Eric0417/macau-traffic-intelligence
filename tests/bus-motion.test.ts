import { describe, expect, it } from "vitest";
import {
  advanceBusMotion,
  buildRoutePath,
  createBusMotion,
  metersBetween,
  pathLengths,
  pointAtDistance,
  projectOnPath,
  vehicleAnchorDistance,
} from "@/components/dashboard/bus-motion";
import type { BusRouteSegment, BusVehicle } from "@/lib/types";

const segmentA: BusRouteSegment = {
  fromStationCode: "A",
  toStationCode: "B",
  trafficStatus: "normal",
  trafficLevel: 1,
  coordinates: [
    [113.55, 22.19],
    [113.56, 22.19],
  ],
};

const segmentB: BusRouteSegment = {
  fromStationCode: "B",
  toStationCode: "C",
  trafficStatus: "normal",
  trafficLevel: 1,
  coordinates: [
    [113.56, 22.19],
    [113.57, 22.19],
  ],
};

const segmentC: BusRouteSegment = {
  fromStationCode: "C",
  toStationCode: "A",
  trafficStatus: "normal",
  trafficLevel: 1,
  coordinates: [
    [113.57, 22.19],
    [113.55, 22.19],
  ],
};

function vehicle(overrides: Partial<BusVehicle> = {}): BusVehicle {
  return {
    id: "V1",
    plate: "AB1234",
    busType: "1",
    lowFloor: true,
    speedKph: 36,
    status: "1",
    stationCode: "B",
    stationName: "站B",
    stationSequence: 1,
    segmentIndex: 0,
    coordinates: [113.555, 22.19],
    bearing: 90,
    estimated: true,
    ...overrides,
  };
}

describe("bus motion", () => {
  it("places a point along the path and projects a position onto it", () => {
    const lengths = pathLengths(segmentA.coordinates);
    const middle = pointAtDistance(
      segmentA.coordinates,
      lengths,
      lengths[lengths.length - 1] / 2,
    );
    expect(middle.coordinates[0]).toBeCloseTo(113.555, 4);
    expect(middle.bearing).toBeCloseTo(90, 1);
    expect(projectOnPath(segmentA.coordinates, lengths, [113.555, 22.19])).toBeCloseTo(
      lengths[lengths.length - 1] / 2,
      -1,
    );
  });

  it("concatenates the official stop-to-stop segments into one path", () => {
    const route = buildRoutePath([segmentA, segmentB, segmentC]);

    expect(route.segments).toHaveLength(3);
    expect(route.segments[0].start).toBe(0);
    expect(route.segments[1].start).toBeCloseTo(route.segments[0].length, 5);
    expect(route.segments[2].start).toBeCloseTo(
      route.segments[0].length + route.segments[1].length,
      5,
    );
    expect(route.total).toBeCloseTo(
      route.segments[0].length + route.segments[1].length + route.segments[2].length,
      5,
    );
    expect(route.closed).toBe(true);
  });

  it("uses the declared segment index instead of guessing from a repeated stop code", () => {
    const route = buildRoutePath([segmentA, segmentB, segmentC]);
    // Stop A is both the first from-station and the last to-station. The feed
    // remembers which segment the estimate belongs to.
    const endOfLoop = vehicleAnchorDistance(
      route,
      vehicle({
        stationCode: "A",
        stationSequence: 2,
        segmentIndex: 2,
        coordinates: [113.552, 22.19],
      }),
    );

    expect(endOfLoop).not.toBeNull();
    expect(endOfLoop!).toBeGreaterThan(route.total * 0.9);
  });

  it("keeps the drawn position continuous when a new estimate arrives", () => {
    const route = buildRoutePath([segmentA, segmentB]);
    const first = createBusMotion(vehicle(), route, "00003-0", "tcm", 1_000)!;
    const polledAt = 11_000;
    const before = advanceBusMotion(first, polledAt);
    const second = createBusMotion(
      vehicle({ coordinates: [113.565, 22.19] }),
      route,
      "00003-0",
      "tcm",
      polledAt,
      first,
    )!;
    const after = advanceBusMotion(second, polledAt);

    expect(metersBetween(before.coordinates, after.coordinates)).toBeLessThan(0.01);
  });

  it("glides toward a coarse estimate step instead of teleporting", () => {
    const route = buildRoutePath([segmentA, segmentB]);
    const first = createBusMotion(vehicle(), route, "00003-0", "tcm", 0)!;
    const polledAt = 10_000;
    const jolted = createBusMotion(
      vehicle({ coordinates: [113.568, 22.19] }),
      route,
      "00003-0",
      "tcm",
      polledAt,
      first,
    )!;

    const atPoll = advanceBusMotion(jolted, polledAt);
    expect(jolted.peakForward).toBeCloseTo(14, 5);

    let previous = atPoll;
    let largestStep = 0;
    for (let second = 1; second <= 300; second += 1) {
      const state = advanceBusMotion(jolted, polledAt + second * 1_000);
      largestStep = Math.max(
        largestStep,
        metersBetween(previous.coordinates, state.coordinates),
      );
      previous = state;
    }
    // Every one-second step stays under the 14 m/s cap, including the first.
    expect(largestStep).toBeLessThan(15);

    const anchor = advanceBusMotion(
      createBusMotion(
        vehicle({ coordinates: [113.568, 22.19] }),
        route,
        "00003-0",
        "tcm",
        polledAt,
        null,
      )!,
      polledAt,
    );
    expect(metersBetween(previous.coordinates, anchor.coordinates)).toBeLessThan(2);
  });

  it("eases a backward correction instead of snapping back", () => {
    const route = buildRoutePath([segmentA, segmentB]);
    const first = createBusMotion(
      vehicle({ coordinates: [113.565, 22.19] }),
      route,
      "00003-0",
      "tcm",
      0,
    )!;
    const polledAt = 10_000;
    const corrected = createBusMotion(
      vehicle({ coordinates: [113.557, 22.19] }),
      route,
      "00003-0",
      "tcm",
      polledAt,
      first,
    )!;

    const atPoll = advanceBusMotion(corrected, polledAt);
    const oneSecond = advanceBusMotion(corrected, polledAt + 1_000);
    // 36 km/h feed speed allows at most 5 m/s while correcting backwards.
    expect(metersBetween(atPoll.coordinates, oneSecond.coordinates)).toBeLessThan(6);

    // Backward speed stays gentle, and the correction finishes eventually.
    const settled = advanceBusMotion(corrected, polledAt + 300_000);
    expect(settled.coordinates[0]).toBeCloseTo(113.557, 3);
  });

  it("continues forward when a loop route starts another lap", () => {
    const route = buildRoutePath([segmentA, segmentB, segmentC]);
    const finishing = createBusMotion(
      vehicle({
        stationCode: "A",
        stationSequence: 2,
        segmentIndex: 2,
        coordinates: [113.552, 22.19],
      }),
      route,
      "00025-0",
      "tcm",
      0,
      null,
    )!;
    const nextLap = createBusMotion(
      vehicle({
        stationCode: "B",
        stationSequence: 1,
        segmentIndex: 0,
        coordinates: [113.551, 22.19],
      }),
      route,
      "00025-0",
      "tcm",
      10_000,
      finishing,
    )!;

    expect(nextLap.target).toBeGreaterThan(route.total);
    expect(nextLap.target - nextLap.distance).toBeLessThan(route.total / 2);
  });

  it("returns null when the vehicle has no usable segment", () => {
    const route = buildRoutePath([segmentA]);
    expect(
      createBusMotion(
        vehicle({ coordinates: null }),
        route,
        "00003-0",
        "tcm",
        0,
      ),
    ).toBeNull();
    expect(
      createBusMotion(
        vehicle({ stationCode: "Z" }),
        buildRoutePath([]),
        "00003-0",
        "tcm",
        0,
      ),
    ).toBeNull();
  });
});
