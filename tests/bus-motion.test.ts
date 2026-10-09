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

  it("caps the bus at the approaching stop", () => {
    const motion = createBusMotion(vehicle, segment, "tcm", null, 0);
    expect(motion).not.toBeNull();
    const later = advanceBusMotion(motion!, 10 * 60_000);
    expect(later.coordinates[0]).toBeCloseTo(113.56, 3);
  });

  it("returns null when the vehicle has no usable segment", () => {
    expect(createBusMotion(vehicle, null, "tcm", null, 0)).toBeNull();
  });
});
