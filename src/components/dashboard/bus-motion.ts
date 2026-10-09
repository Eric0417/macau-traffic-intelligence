import type { BusRouteSegment, BusVehicle } from "@/lib/types";
import type { BusLivery } from "@/components/dashboard/bus-3d-layer";

export type LngLat = [number, number];

const METERS_PER_DEGREE_LAT = 111_320;
const MAX_SPEED_METERS_PER_SECOND = 22; // about 80 km/h

export function metersBetween(a: LngLat, b: LngLat): number {
  const latRadians = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos(latRadians);
  const dx = (b[0] - a[0]) * metersPerDegreeLng;
  const dy = (b[1] - a[1]) * METERS_PER_DEGREE_LAT;
  return Math.hypot(dx, dy);
}

export function pathLengths(path: LngLat[]): number[] {
  const lengths = [0];
  for (let index = 1; index < path.length; index += 1) {
    lengths.push(lengths[index - 1] + metersBetween(path[index - 1], path[index]));
  }
  return lengths;
}

function bearingBetween(a: LngLat, b: LngLat): number {
  return (
    ((Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI + 360) % 360
  );
}

export interface PathPoint {
  coordinates: LngLat;
  bearing: number;
}

export function pointAtDistance(
  path: LngLat[],
  lengths: number[],
  distance: number,
): PathPoint {
  if (path.length === 0) return { coordinates: [0, 0], bearing: 0 };
  if (path.length === 1 || lengths[lengths.length - 1] === 0) {
    return { coordinates: path[0], bearing: 0 };
  }

  const target = Math.max(0, Math.min(distance, lengths[lengths.length - 1]));
  for (let index = 1; index < path.length; index += 1) {
    if (lengths[index] < target) continue;
    const segmentLength = lengths[index] - lengths[index - 1];
    const ratio = segmentLength === 0 ? 0 : (target - lengths[index - 1]) / segmentLength;
    const from = path[index - 1];
    const to = path[index];
    return {
      coordinates: [
        from[0] + (to[0] - from[0]) * ratio,
        from[1] + (to[1] - from[1]) * ratio,
      ],
      bearing: bearingBetween(from, to),
    };
  }

  const last = path[path.length - 1];
  return {
    coordinates: last,
    bearing: bearingBetween(path[path.length - 2], last),
  };
}

export function projectOnPath(
  path: LngLat[],
  lengths: number[],
  point: LngLat,
): number {
  if (path.length < 2) return 0;
  let bestDistance = 0;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1];
    const to = path[index];
    const latRadians = ((from[1] + to[1]) / 2) * (Math.PI / 180);
    const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos(latRadians);
    const segmentX = (to[0] - from[0]) * metersPerDegreeLng;
    const segmentY = (to[1] - from[1]) * METERS_PER_DEGREE_LAT;
    const pointX = (point[0] - from[0]) * metersPerDegreeLng;
    const pointY = (point[1] - from[1]) * METERS_PER_DEGREE_LAT;
    const lengthSquared = segmentX * segmentX + segmentY * segmentY;
    const ratio =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, (pointX * segmentX + pointY * segmentY) / lengthSquared),
          );
    const projectedDistance =
      lengths[index - 1] + Math.sqrt(lengthSquared) * ratio;
    const projectedPoint: LngLat = [
      from[0] + (to[0] - from[0]) * ratio,
      from[1] + (to[1] - from[1]) * ratio,
    ];
    const distanceFromPoint = metersBetween(projectedPoint, point);
    if (distanceFromPoint < bestDelta) {
      bestDelta = distanceFromPoint;
      bestDistance = projectedDistance;
    }
  }

  return bestDistance;
}

export interface BusMotion {
  id: string;
  livery: BusLivery;
  plate: string;
  stationName: string;
  lowFloor: boolean;
  path: LngLat[];
  lengths: number[];
  distance: number;
  speedMetersPerSecond: number;
  startedAt: number;
}

export interface BusMotionState {
  id: string;
  plate: string;
  stationName: string;
  lowFloor: boolean;
  livery: BusLivery;
  coordinates: LngLat;
  bearing: number;
}

export function createBusMotion(
  vehicle: BusVehicle,
  segment: BusRouteSegment | null,
  livery: BusLivery,
  etaMinutes: number | null,
  now: number,
): BusMotion | null {
  if (!vehicle.coordinates) return null;
  const path = segment?.coordinates ?? null;
  if (!path || path.length < 2) return null;

  const lengths = pathLengths(path);
  const total = lengths[lengths.length - 1];
  const distance = Math.min(projectOnPath(path, lengths, vehicle.coordinates), total);
  const remaining = Math.max(0, total - distance);
  const etaSeconds = (etaMinutes ?? 0) * 60;

  let speed = (vehicle.speedKph ?? 0) / 3.6;
  if (speed <= 0.8 && etaSeconds > 5 && remaining > 0) {
    speed = remaining / etaSeconds;
  }
  speed = Math.min(Math.max(speed, 0), MAX_SPEED_METERS_PER_SECOND);

  return {
    id: vehicle.id,
    livery,
    plate: vehicle.plate,
    stationName: vehicle.stationName,
    lowFloor: vehicle.lowFloor,
    path,
    lengths,
    distance,
    speedMetersPerSecond: speed,
    startedAt: now,
  };
}

export function advanceBusMotion(motion: BusMotion, now: number): BusMotionState {
  const elapsed = Math.max(0, now - motion.startedAt) / 1000;
  const total = motion.lengths[motion.lengths.length - 1] ?? 0;
  const distance = Math.min(motion.distance + motion.speedMetersPerSecond * elapsed, total);
  const point = pointAtDistance(motion.path, motion.lengths, distance);
  return {
    id: motion.id,
    plate: motion.plate,
    stationName: motion.stationName,
    lowFloor: motion.lowFloor,
    livery: motion.livery,
    coordinates: point.coordinates,
    bearing: point.bearing,
  };
}
