import type { BusRouteSegment, BusVehicle } from "@/lib/types";
import type { BusLivery } from "@/components/dashboard/bus-3d-layer";

export type LngLat = [number, number];

const METERS_PER_DEGREE_LAT = 111_320;
const POINT_EPSILON_DEGREES = 1e-9;
const CLOSED_LOOP_RADIUS_METERS = 120;
// The marker glides between feed estimates instead of dead-reckoning ahead of
// them. Peak speed stays inside a plausible bus range so a coarse ETA step
// cannot teleport the vehicle across the route.
const MIN_FORWARD_SPEED = 6; // 21.6 km/h
const MAX_FORWARD_SPEED = 20; // 72 km/h
const MIN_BACKWARD_SPEED = 1.2;
const MAX_BACKWARD_SPEED = 5;

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

export interface RoutePathSegment {
  fromStationCode: string;
  toStationCode: string;
  path: LngLat[];
  lengths: number[];
  length: number;
  /** Distance from the start of the concatenated path to this segment's first point. */
  start: number;
}

export interface RoutePath {
  path: LngLat[];
  lengths: number[];
  total: number;
  closed: boolean;
  segments: RoutePathSegment[];
}

// Concatenate the official stop-to-stop polylines into one path so a vehicle
// can move across segment boundaries without being re-projected or snapped.
export function buildRoutePath(routeSegments: BusRouteSegment[]): RoutePath {
  const path: LngLat[] = [];
  const lengths: number[] = [];
  const segments: RoutePathSegment[] = [];
  let total = 0;

  const append = (point: LngLat) => {
    const last = path[path.length - 1];
    if (
      last &&
      Math.abs(last[0] - point[0]) < POINT_EPSILON_DEGREES &&
      Math.abs(last[1] - point[1]) < POINT_EPSILON_DEGREES
    ) {
      return;
    }
    if (last) total += metersBetween(last, point);
    path.push(point);
    lengths.push(total);
  };

  for (const segment of routeSegments) {
    if (segment.coordinates.length < 2) continue;
    const segmentLengths = pathLengths(segment.coordinates);
    const length = segmentLengths[segmentLengths.length - 1];
    if (!(length > 0)) continue;

    append(segment.coordinates[0]);
    const start = total;
    for (let index = 1; index < segment.coordinates.length; index += 1) {
      append(segment.coordinates[index]);
    }
    segments.push({
      fromStationCode: segment.fromStationCode,
      toStationCode: segment.toStationCode,
      path: segment.coordinates,
      lengths: segmentLengths,
      length,
      start,
    });
  }

  const first = path[0];
  const last = path[path.length - 1];
  return {
    path,
    lengths,
    total,
    closed:
      path.length > 3 &&
      first !== undefined &&
      last !== undefined &&
      metersBetween(first, last) < CLOSED_LOOP_RADIUS_METERS,
    segments,
  };
}

function segmentIndexForVehicle(route: RoutePath, vehicle: BusVehicle): number {
  const segments = route.segments;
  const declared = vehicle.segmentIndex;
  if (typeof declared === "number" && declared >= 0 && declared < segments.length) {
    return declared;
  }

  // Fallback for cached payloads from before segmentIndex existed: mirror the
  // adapter's stop-based pairing, latest match first for return trips.
  if (vehicle.stationSequence > 0) {
    for (let index = segments.length - 1; index >= 0; index -= 1) {
      if (segments[index].toStationCode === vehicle.stationCode) return index;
    }
  } else {
    for (let index = 0; index < segments.length; index += 1) {
      if (segments[index].fromStationCode === vehicle.stationCode) return index;
    }
  }
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (segments[index].toStationCode === vehicle.stationCode) return index;
  }
  return segments.findIndex(
    (segment) =>
      segment.fromStationCode === vehicle.stationCode ||
      segment.toStationCode === vehicle.stationCode,
  );
}

export function vehicleAnchorDistance(
  route: RoutePath,
  vehicle: BusVehicle,
): number | null {
  if (!vehicle.coordinates) return null;
  const index = segmentIndexForVehicle(route, vehicle);
  if (index < 0) return null;
  const segment = route.segments[index];
  const local = projectOnPath(segment.path, segment.lengths, vehicle.coordinates);
  return segment.start + Math.min(Math.max(local, 0), segment.length);
}

export interface BusMotion {
  id: string;
  livery: BusLivery;
  plate: string;
  stationName: string;
  lowFloor: boolean;
  routeKey: string;
  route: RoutePath;
  /** Current displayed route distance, unwrapped across loop laps. */
  distance: number;
  /** Official estimate the marker moves toward, unwrapped across loop laps. */
  target: number;
  /** Signed speed along the route in metres per second. */
  speed: number;
  peakForward: number;
  peakBackward: number;
  at: number;
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

function resolvedDistance(route: RoutePath, distance: number): number {
  if (!(route.total > 0)) return distance;
  if (route.closed) {
    const wrapped = distance % route.total;
    return wrapped < 0 ? wrapped + route.total : wrapped;
  }
  return Math.min(Math.max(distance, 0), route.total);
}

const RESPONSE_SECONDS = 2.5;
const SPEED_SMOOTHING_SECONDS = 0.8;
const INTEGRATION_STEP_SECONDS = 0.25;

interface PursuitState {
  distance: number;
  speed: number;
}

// A speed-limited pursuit controller. The displayed distance moves toward the
// official estimate with a bounded speed, so a coarse ETA step anywhere on the
// route can only change the direction of travel, never the position.
function pursue(motion: BusMotion, now: number): PursuitState {
  let remaining = Math.max(0, (now - motion.at) / 1_000);
  if (remaining > 60) {
    // The tab or the machine was away long enough that gliding from the stale
    // position would be meaningless. Resume at the latest estimate instead.
    motion.distance = motion.target;
    motion.speed = 0;
    motion.at = now;
    return { distance: motion.distance, speed: motion.speed };
  }
  while (remaining > 0) {
    const step = Math.min(remaining, INTEGRATION_STEP_SECONDS);
    const gap = motion.target - motion.distance;
    const desired = Math.min(
      motion.peakForward,
      Math.max(-motion.peakBackward, gap / RESPONSE_SECONDS),
    );
    motion.speed +=
      (desired - motion.speed) * (1 - Math.exp(-step / SPEED_SMOOTHING_SECONDS));

    if (Math.abs(gap) < 0.5 && Math.abs(motion.speed) < 0.05) {
      motion.distance = motion.target;
      motion.speed = 0;
    } else {
      const next = motion.distance + motion.speed * step;
      const passedTarget =
        (gap > 0 && next >= motion.target) || (gap < 0 && next <= motion.target);
      if (passedTarget) {
        motion.distance = motion.target;
        motion.speed = 0;
      } else {
        motion.distance = next;
      }
    }
    remaining -= step;
  }
  if (now > motion.at) motion.at = now;
  return { distance: motion.distance, speed: motion.speed };
}

export function createBusMotion(
  vehicle: BusVehicle,
  route: RoutePath,
  routeKey: string,
  livery: BusLivery,
  now: number,
  previous?: BusMotion | null,
): BusMotion | null {
  const anchor = vehicleAnchorDistance(route, vehicle);
  if (anchor === null) return null;

  let distance = anchor;
  let speed = 0;
  if (previous && previous.routeKey === routeKey) {
    const state = pursue(previous, now);
    distance = state.distance;
    speed = state.speed;
  }

  let target = anchor;
  if (previous && previous.routeKey === routeKey && route.closed) {
    // The vehicle started another lap at the same terminal. Keep advancing
    // along the loop instead of snapping back to the first segment.
    while (target + route.total / 2 < distance) target += route.total;
  }

  const feedSpeed = (vehicle.speedKph ?? 0) / 3.6;

  return {
    id: vehicle.id,
    livery,
    plate: vehicle.plate,
    stationName: vehicle.stationName,
    lowFloor: vehicle.lowFloor,
    routeKey,
    route,
    distance,
    target,
    speed,
    peakForward: Math.min(
      MAX_FORWARD_SPEED,
      Math.max(MIN_FORWARD_SPEED, feedSpeed * 1.4),
    ),
    peakBackward: Math.min(
      MAX_BACKWARD_SPEED,
      Math.max(MIN_BACKWARD_SPEED, feedSpeed * 0.6),
    ),
    at: now,
  };
}

export function advanceBusMotion(motion: BusMotion, now: number): BusMotionState {
  const state = pursue(motion, now);
  const distance = resolvedDistance(motion.route, state.distance);
  const point = pointAtDistance(motion.route.path, motion.route.lengths, distance);
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
