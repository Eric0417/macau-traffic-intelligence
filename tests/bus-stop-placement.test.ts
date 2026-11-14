import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  busStopDisplayPoses,
  BUS_FOOTPRINT,
  STOP_FOOTPRINT,
  STOP_CLEARANCE_METERS,
} from "@/components/dashboard/bus-stop-placement";
import { TRANSIT_DISPLAY_SCALE } from "@/components/dashboard/transit-display";
import {
  bearingBetween,
  buildRoutePath,
  busPoseAtDistance,
  metersBetween,
} from "@/components/dashboard/bus-motion";
import type { BusEta } from "@/lib/types";

type Point = [number, number];
const anchor: Point = [113.55, 22.19];
const point = (east: number, north: number): Point => [
  anchor[0] + east / (111_320 * Math.cos((anchor[1] * Math.PI) / 180)),
  anchor[1] + north / 111_320,
];
function route(path: Point[]): Pick<BusEta, "stops" | "routeSegments"> {
  return {
    stops: [
      {
        sequence: 0,
        stationCode: "S1",
        stationName: "站",
        coordinates: anchor,
        stopsAway: 0,
        suspended: false,
        trafficStatus: "normal",
        trafficLevel: 1,
      },
    ],
    routeSegments: [
      {
        fromStationCode: "S1",
        toStationCode: "S2",
        trafficStatus: "normal",
        trafficLevel: 1,
        coordinates: path,
      },
    ],
  };
}

function expectClearOfBus(sign: Point, centre: Point, heading: number) {
  const angle = (heading * Math.PI) / 180;
  const east =
    (sign[0] - centre[0]) * 111_320 * Math.cos((anchor[1] * Math.PI) / 180);
  const north = (sign[1] - centre[1]) * 111_320;
  const along = east * Math.sin(angle) + north * Math.cos(angle);
  const side = east * Math.cos(angle) - north * Math.sin(angle);
  const scale = TRANSIT_DISPLAY_SCALE;
  const gapToBus = Math.hypot(
    Math.max(0, Math.abs(along) - (BUS_FOOTPRINT.length * scale) / 2),
    Math.max(0, Math.abs(side) - (BUS_FOOTPRINT.width * scale) / 2),
  );
  expect(gapToBus).toBeGreaterThanOrEqual(
    (Math.hypot(STOP_FOOTPRINT.length, STOP_FOOTPRINT.width) * scale) / 2 +
      STOP_CLEARANCE_METERS -
      0.02,
  );
}

describe("schematic bus stop placement", () => {
  for (const [name, path] of [
    ["northbound", [point(0, -80), point(0, 80)]],
    ["southbound", [point(0, 80), point(0, -80)]],
    ["eastbound", [point(-80, 0), point(80, 0)]],
    ["diagonal", [point(-80, -80), point(80, 80)]],
    ["right-angle bend", [point(0, -80), anchor, point(80, 0)]],
    [
      "rounded bend",
      [point(0, -80), point(0, -8), point(2, -2), point(8, 0), point(80, 0)],
    ],
  ] as const) {
    it(`keeps the sign clear of approaching bus bodies on a ${name} path`, () => {
      const input = route(path as unknown as Point[]);
      const original = structuredClone(input);
      const [sign] = busStopDisplayPoses(input);
      expect(sign).toBeDefined();
      expect(sign.anchor).toEqual(anchor);
      expect(metersBetween(sign.coordinates, anchor)).toBeGreaterThan(10);
      const routePath = buildRoutePath(input.routeSegments);
      for (let distance = 0; distance <= routePath.total; distance += 1) {
        const bus = busPoseAtDistance(routePath, distance);
        expectClearOfBus(sign.coordinates, bus.coordinates, bus.bearing);
        expectClearOfBus(
          sign.coordinates,
          bus.coordinates,
          (bus.bearing + 180) % 360,
        );
      }
      expect(input).toEqual(original);
    });
  }

  it("uses the same side for a reversed straight route and keeps the sign parallel to it", () => {
    const north = busStopDisplayPoses(route([point(0, -80), point(0, 80)]))[0];
    const south = busStopDisplayPoses(route([point(0, 80), point(0, -80)]))[0];
    expect(metersBetween(north.coordinates, south.coordinates)).toBeLessThan(
      0.01,
    );
    expect(north.bearing).toBeCloseTo(
      bearingBetween(point(0, -80), point(0, 80)),
      3,
    );
  });

  it("keeps the sign clear of a second nearby return lane", () => {
    const input = route([
      point(0, -80),
      point(0, 80),
      point(12, 80),
      point(12, -80),
    ]);
    const [sign] = busStopDisplayPoses(input);
    expect(sign).toBeDefined();
    for (const x of [0, 12])
      for (let y = -70; y <= 70; y += 2)
        expectClearOfBus(sign.coordinates, point(x, y), 0);
  });

  it("keeps an untracked stop schematic without inventing a route heading", () => {
    const input = route([]);
    const [sign] = busStopDisplayPoses(input);
    expect(sign.anchor).toEqual(anchor);
    expect(sign.bearing).toBeNull();
    expect(metersBetween(sign.coordinates, anchor)).toBeGreaterThan(10);
  });

  it("encloses the actual exported mesh around its render origin", () => {
    for (const [name, footprint] of [
      ["bus-tcm", BUS_FOOTPRINT],
      ["bus-transmac", BUS_FOOTPRINT],
      ["bus-stop", STOP_FOOTPRINT],
    ] as const) {
      const bytes = readFileSync(`public/models/${name}.glb`);
      const asset = JSON.parse(
        bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12)),
      );
      expect(asset.nodes).toEqual([{ mesh: 0, name }]);
      for (const primitive of asset.meshes[0].primitives) {
        const bounds = asset.accessors[primitive.attributes.POSITION];
        for (const end of [bounds.min, bounds.max]) {
          expect(Math.abs(end[0])).toBeLessThanOrEqual(footprint.length / 2);
          expect(Math.abs(end[2])).toBeLessThanOrEqual(footprint.width / 2);
        }
      }
    }
  });
});
