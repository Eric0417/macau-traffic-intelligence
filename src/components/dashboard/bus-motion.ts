import type { BusRouteSegment, BusVehicle } from "@/lib/types";
import type { BusLivery } from "@/components/dashboard/bus-3d-layer";
import { TRANSIT_DISPLAY_SCALE } from "./transit-display";

import { metersBetween, pathLengths, bearingBetween, pointAtDistance, projectOnPath, type LngLat, type PathPoint } from "@/lib/route-geometry";
export { metersBetween, pathLengths, bearingBetween, pointAtDistance, projectOnPath, type LngLat, type PathPoint } from "@/lib/route-geometry";

const POINT_EPSILON_DEGREES = 1e-9;
const CLOSED_LOOP_RADIUS_METERS = 120;
const MIN_FORWARD_SPEED = 6;
const MAX_FORWARD_SPEED = 20;

export interface RoutePathSegment {
  sourceIndex: number;
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

  for (const [sourceIndex, segment] of routeSegments.entries()) {
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
      sourceIndex,
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
  if (typeof declared === "number") {
    const index = segments.findIndex(segment => segment.sourceIndex === declared);
    if (index >= 0) return index;
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
  /** Forward speed along the route in metres per second. */
  speed: number;
  peakForward: number;
  trackingStartedAt?: string;
  trackedProgress?: number;
  sourceSegmentIndex: number;
  lap: number;
  at: number;
  prediction?: { anchor: number; end: number; speed: number; startedAt: number; until: number };
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

// Follow accepted forward progress. If an update trails the drawn position,
// wait for it to catch up instead of driving backwards along the road.
function pursue(motion: BusMotion, now: number): PursuitState {
  if (motion.prediction) {
    const prediction = motion.prediction;
    const seconds = Math.max(0, Math.min(now, prediction.until) - prediction.startedAt) / 1000;
    motion.target = Math.min(prediction.end, prediction.anchor + prediction.speed * seconds);
  }
  motion.target = Math.max(motion.distance, motion.target);
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
    if (gap <= 0) {
      motion.speed = 0;
      break;
    }
    const desired = Math.min(
      motion.peakForward,
      Math.max(0, gap / RESPONSE_SECONDS),
    );
    motion.speed +=
      (desired - motion.speed) * (1 - Math.exp(-step / SPEED_SMOOTHING_SECONDS));

    if (Math.abs(gap) < 0.5 && Math.abs(motion.speed) < 0.05) {
      motion.distance = motion.target;
      motion.speed = 0;
    } else {
      const next = motion.distance + motion.speed * step;
      const passedTarget = next >= motion.target;
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
  if (vehicle.tracking === null) return null;
  const segmentIndex = segmentIndexForVehicle(route, vehicle);
  const forecast = vehicle.prediction;
  const segment = route.segments[segmentIndex];
  const track = vehicle.tracking;
  const anchor = track && segment && track.segmentIndex === segment.sourceIndex
    ? segment.start + track.distanceAlongSegment
    : forecast && segment && forecast.segmentIndex === segment.sourceIndex
      ? segment.start + forecast.distanceAlongSegment
      : vehicleAnchorDistance(route, vehicle);
  if (anchor === null || segmentIndex < 0) return null;

  const sameRoute = Boolean(previous && previous.routeKey === routeKey && previous.plate === vehicle.plate && previous.trackingStartedAt === track?.startedAt && now - previous.at <= 60_000);
  let distance = anchor;
  let speed = 0;
  if (previous && sameRoute) {
    const state = pursue(previous, now);
    distance = state.distance;
    speed = state.speed;
  }

  let target = anchor;
  let lap = previous && sameRoute ? previous.lap : 0;
  if (previous && sameRoute && route.closed) {
    // The vehicle started another lap at the same terminal. Keep advancing
    // along the loop instead of snapping back to the first segment.
    const confirmedLap = track && previous.trackedProgress !== undefined
      ? track.progress >= previous.trackedProgress && track.segmentIndex < previous.sourceSegmentIndex
      : segment.sourceIndex < previous.sourceSegmentIndex && distance % route.total > route.total * .9 && anchor < route.total * .1;
    if (confirmedLap) lap++;
    target += lap * route.total;
  }

  const feedSpeed = (vehicle.speedKph ?? 0) / 3.6;

  const lapOffset = target - anchor;
  const prediction = forecast && forecast.segmentIndex === segment.sourceIndex ? {
    anchor: target, end: segment.start + segment.length + lapOffset,
    speed: forecast.speedKph / 3.6, startedAt: Date.parse(forecast.anchorAt), until: Date.parse(forecast.validUntil),
  } : undefined;
  const motion: BusMotion = {
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
    trackingStartedAt: track?.startedAt,
    trackedProgress: track?.progress,
    sourceSegmentIndex: segment.sourceIndex,
    lap,
    at: now,
    prediction,
  };
  pursue(motion, now);
  if (!sameRoute) motion.distance = motion.target;
  return motion;
}

export function busMotionIsActive(motion: BusMotion, now: number): boolean {
  return motion.distance !== motion.target || motion.speed !== 0 || Boolean(
    motion.prediction && now < motion.prediction.until && motion.target < motion.prediction.end,
  );
}

export function advanceBusMotion(motion: BusMotion, now: number): BusMotionState {
  const state = pursue(motion, now);
  const distance = resolvedDistance(motion.route, state.distance);
  const point = busPoseAtDistance(motion.route, distance);
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

// Both GLB buses have a roughly 7 m wheelbase before display scaling.
const BUS_HALF_WHEELBASE = (7 * TRANSIT_DISPLAY_SCALE) / 2;

export function busPoseAtDistance(route: RoutePath, distance: number): PathPoint {
  const { path, lengths, total } = route;
  const pose = pointAtDistance(path, lengths, distance);
  const first = path[0];
  const last = path.at(-1);
  // Motion can roll over at nearby terminals. Only sample across the seam
  // when the actual polyline closes there.
  const joinsAtSeam = route.closed && first && last && metersBetween(first, last) < 0.01;
  const half = Math.min(BUS_HALF_WHEELBASE, total / 4);
  const rearDistance = distance - half;
  const frontDistance = distance + half;
  const rear = pointAtDistance(path, lengths, joinsAtSeam && rearDistance < 0 ? rearDistance + total : rearDistance);
  const front = pointAtDistance(path, lengths, joinsAtSeam && frontDistance > total ? frontDistance - total : frontDistance);
  if (metersBetween(rear.coordinates, front.coordinates) < 0.01) return pose;
  return { coordinates: pose.coordinates, bearing: bearingBetween(rear.coordinates, front.coordinates) };
}
