import type { BusEta } from "@/lib/types";
import { bearingBetween, type LngLat } from "./bus-motion";
import { TRANSIT_DISPLAY_SCALE } from "./transit-display";

// Conservative horizontal bounds of the exported meshes, including mirrors.
export const BUS_FOOTPRINT = { length: 12, width: 3.5 };
export const STOP_FOOTPRINT = { length: 0.76, width: 1.16 };
export const STOP_CLEARANCE_METERS = 2;
const METERS_PER_DEGREE = 111_320;

type Point = { x: number; y: number };
export interface BusStopDisplayPose {
  id: string;
  anchor: LngLat;
  coordinates: LngLat;
  bearing: number | null;
}

export function busStopDisplayPoses(
  route: Pick<BusEta, "stops" | "routeSegments">,
): BusStopDisplayPose[] {
  const edges = route.routeSegments.flatMap((segment) =>
    segment.coordinates
      .slice(1)
      .map((end, index) => ({ start: segment.coordinates[index], end })),
  );
  const scale = TRANSIT_DISPLAY_SCALE;
  const signRadius =
    (Math.hypot(STOP_FOOTPRINT.length, STOP_FOOTPRINT.width) * scale) / 2;
  const offset =
    (BUS_FOOTPRINT.width * scale) / 2 + signRadius + STOP_CLEARANCE_METERS;

  return route.stops.flatMap((stop) => {
    const anchor = stop.coordinates;
    if (!anchor) return [];
    const longitudeMeters =
      METERS_PER_DEGREE * Math.cos((anchor[1] * Math.PI) / 180);
    const local = (coordinate: LngLat): Point => ({
      x: (coordinate[0] - anchor[0]) * longitudeMeters,
      y: (coordinate[1] - anchor[1]) * METERS_PER_DEGREE,
    });
    const lanes = edges.flatMap(({ start, end }) => {
      const a = local(start),
        b = local(end);
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length < 0.01) return [];
      const unit = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
      const bearing = bearingBetween(start, end);
      const angle = (bearing * Math.PI) / 180;
      const cosine = Math.abs(
        unit.x * Math.sin(angle) + unit.y * Math.cos(angle),
      );
      const sine = Math.abs(
        unit.x * Math.cos(angle) - unit.y * Math.sin(angle),
      );
      // Enclose the rendered bus orientation, which uses the same heading as
      // the vehicle layer, while its centre moves along this source edge.
      const halfLength =
        ((BUS_FOOTPRINT.length * cosine + BUS_FOOTPRINT.width * sine) * scale) /
        2;
      const halfWidth =
        ((BUS_FOOTPRINT.width * cosine + BUS_FOOTPRINT.length * sine) * scale) /
        2;
      const projection = Math.max(
        0,
        Math.min(length, -(a.x * unit.x + a.y * unit.y)),
      );
      return [
        {
          a,
          unit,
          length,
          halfLength,
          halfWidth,
          bearing,
          distance: Math.hypot(
            a.x + unit.x * projection,
            a.y + unit.y * projection,
          ),
        },
      ];
    });
    const nearest = lanes.reduce<(typeof lanes)[number] | null>(
      (best, lane) => (!best || lane.distance < best.distance ? lane : best),
      null,
    );
    let normal = nearest
      ? { x: nearest.unit.y, y: -nearest.unit.x }
      : { x: 1, y: 0 };
    // A reversed route keeps the same preferred display side.
    if (normal.x < -0.001 || (Math.abs(normal.x) <= 0.001 && normal.y < 0))
      normal = { x: -normal.x, y: -normal.y };
    const clear = (point: Point) =>
      lanes.every((lane) => {
        const dx = point.x - lane.a.x,
          dy = point.y - lane.a.y;
        const along = dx * lane.unit.x + dy * lane.unit.y;
        const side = Math.abs(dx * lane.unit.y - dy * lane.unit.x);
        const beyond = Math.max(
          0,
          -lane.halfLength - along,
          along - lane.length - lane.halfLength,
        );
        const gap = Math.hypot(beyond, Math.max(0, side - lane.halfWidth));
        return gap >= signRadius + STOP_CLEARANCE_METERS - 0.001;
      });
    for (
      let distance = offset;
      distance <= offset + (BUS_FOOTPRINT.length * scale) / 2;
      distance += 2
    ) {
      for (const side of [1, -1]) {
        const display = {
          x: normal.x * distance * side,
          y: normal.y * distance * side,
        };
        if (clear(display))
          return [
            {
              id: `${stop.sequence}:${stop.stationCode}`,
              anchor,
              coordinates: [
                anchor[0] + display.x / longitudeMeters,
                anchor[1] + display.y / METERS_PER_DEGREE,
              ] as LngLat,
              bearing: nearest?.bearing ?? null,
            },
          ];
      }
    }
    // Tight loops may leave no clear position nearby. Retain the official flat
    // marker instead of putting a 3D sign inside the swept vehicle footprint.
    return [];
  });
}
