import { describe, expect, it } from "vitest";
import {
  advanceBusMotion,
  createBusMotion,
  pathLengths,
  pointAtDistance,
} from "@/components/dashboard/bus-motion";
import type { BusRouteSegment, BusVehicle } from "@/lib/types";

const segment: BusRouteSegment = {
  fromStationCode: "A",
  toStationCode: "B",
  trafficStatus: "normal",
  trafficLevel: 1,
  coordinates: [
    [113.55, 22.19],
    [113.56, 22.19],
  ],
};

const vehicle: BusVehicle = {
  id: "V1",
  plate: "AB1234",
  busType: "1",
  lowFloor: true,
  speedKph: 36,
  status: "1",
  stationCode: "B",
  stationName: "站B",
  stationSequence: 1,
  coordinates: [113.555, 22.19],
  bearing: 90,
  estimated: true,
};

describe("bus motion", () => {
  it("places a point along the path and projects a position onto it", () => {
    const lengths = pathLengths(segment.coordinates);
    const middle = pointAtDistance(
      segment.coordinates,
      lengths,
      lengths[lengths.length - 1] / 2,
    );
    expect(middle.coordinates[0]).toBeCloseTo(113.555, 4);
    expect(middle.bearing).toBeCloseTo(90, 1);
  });

  it("advances a bus along its segment using the feed speed", () => {
    const motion = createBusMotion(vehicle, segment, "tcm", null, 0);
    expect(motion).not.toBeNull();
    const start = advanceBusMotion(motion!, 0);
    const later = advanceBusMotion(motion!, 10_000);
    expect(later.coordinates[0]).toBeGreaterThan(start.coordinates[0]);
  });

  it("falls back to the approaching stop ETA when the speed is missing", () => {
    const motion = createBusMotion(
      { ...vehicle, speedKph: null },
      segment,
      "tcm",
      1,
      0,
    );
    expect(motion).not.toBeNull();
    const later = advanceBusMotion(motion!, 30_000);
    expect(later.coordinates[0]).toBeGreaterThan(113.555);
  });

  it("caps a bus near the stop just before the stop", () => {
    const motion = createBusMotion(
      { ...vehicle, coordinates: [113.5595, 22.19] },
      segment,
      "tcm",
      null,
      0,
    );
    expect(motion).not.toBeNull();
    const later = advanceBusMotion(motion!, 10 * 60_000);
    expect(later.coordinates[0]).toBeCloseTo(113.5598, 3);
    expect(later.coordinates[0]).toBeLessThan(113.56);
  });

  it("keeps a bus far from the stop inside one poll window", () => {
    const motion = createBusMotion(vehicle, segment, "tcm", null, 0);
    expect(motion).not.toBeNull();
    const later = advanceBusMotion(motion!, 10 * 60_000);
    expect(later.coordinates[0]).toBeLessThan(113.557);
    expect(later.coordinates[0]).toBeGreaterThan(113.556);
  });

  it("eases down instead of overshooting the stop", () => {
    const motion = createBusMotion(
      { ...vehicle, coordinates: [113.5595, 22.19] },
      segment,
      "tcm",
      null,
      0,
    );
    expect(motion).not.toBeNull();
    const positions = Array.from({ length: 12 }, (_, index) =>
      advanceBusMotion(motion!, (index + 1) * 1000).coordinates[0],
    );
    const steps = positions
      .slice(1)
      .map((value, index) => value - positions[index]);
    expect(steps[steps.length - 1]).toBeLessThan(steps[0]);
    expect(Math.max(...positions)).toBeLessThanOrEqual(113.56);
  });

  it("blends from the last rendered position on a new poll", () => {
    const base = createBusMotion(vehicle, segment, "tcm", null, 0);
    const handed = createBusMotion(vehicle, segment, "tcm", null, 0, {
      coordinates: [113.5555, 22.19],
      at: -100,
    });
    expect(base).not.toBeNull();
    expect(handed).not.toBeNull();
    expect(advanceBusMotion(handed!, 0).coordinates[0]).toBeGreaterThan(
      advanceBusMotion(base!, 0).coordinates[0],
    );
    const settled = advanceBusMotion(handed!, 4_000).coordinates[0];
    expect(settled).toBeLessThanOrEqual(113.56);
  });

  it("returns null when the vehicle has no usable segment", () => {
    expect(createBusMotion(vehicle, null, "tcm", null, 0)).toBeNull();
  });
});
