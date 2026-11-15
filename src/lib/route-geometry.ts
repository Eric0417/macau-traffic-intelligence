export type LngLat = [number, number];

const METERS_PER_DEGREE_LAT = 111_320;
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

export function bearingBetween(a: LngLat, b: LngLat): number {
  const latitude = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const east = (b[0] - a[0]) * Math.cos(latitude);
  return (
    ((Math.atan2(east, b[1] - a[1]) * 180) / Math.PI + 360) % 360
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
