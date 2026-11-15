import type { BusEta, BusEtaStop, BusVehicle } from "./types";
import { metersBetween, pathLengths, pointAtDistance, projectOnPath } from "./route-geometry";

// These are model assumptions, not calibrated travel-time measurements.
const TRAFFIC_CAP_KPH: Record<number, number> = { 1: 28, 2: 18, 3: 10, 4: 5 };
const DWELL_SECONDS = 20;
const POSITION_HORIZON_MS = 15_000;
const UNCHANGED_LIMIT_MS = 30_000;

export function usableArrivalEstimate(stop: BusEtaStop, now = Date.now()) {
  const estimate = stop.arrivalEstimate;
  const age = estimate ? now - Date.parse(estimate.generatedAt) : Infinity;
  return !stop.suspended && age >= 0 && age <= 10_000 ? estimate ?? null : null;
}

export function predictBusArrivals(data: BusEta, loop: boolean, now: number, previous?: BusEta): BusEta {
  const segments = data.routeSegments.map(segment => {
    const lengths = pathLengths(segment.coordinates);
    return { ...segment, lengths, length: lengths.at(-1) ?? 0 };
  });
  const stops = data.stops.map(stop => ({ ...stop, arrivalEstimate: null as BusEtaStop["arrivalEstimate"] }));
  const previousVehicles = previous?.routeCode === data.routeCode && previous.direction === data.direction
    ? previous.vehicles : [];
  const vehicles = data.vehicles.map((vehicle): BusVehicle => {
    const old = previousVehicles.find(item => item.id === vehicle.id && item.plate === vehicle.plate);
    const unchanged = old?.coordinates && vehicle.coordinates && old.predictionAnchorAt
      && metersBetween(old.coordinates, vehicle.coordinates) < 2;
    const anchorAt = unchanged ? old.predictionAnchorAt! : new Date(now).toISOString();
    const anchorTime = Date.parse(anchorAt);
    const result: BusVehicle = { ...vehicle, predictionAnchorAt: anchorAt, prediction: null };
    if (vehicle.positionSource !== "feed" || !vehicle.coordinates || now - anchorTime > UNCHANGED_LIMIT_MS || now < anchorTime) return result;

    // The stop report can lag behind the position feed. Check both adjoining
    // segments, without snapping to another direction on a nearby road.
    const candidates = segments.flatMap((segment, index) => {
      if (index !== vehicle.segmentIndex && segment.fromStationCode !== vehicle.stationCode && segment.toStationCode !== vehicle.stationCode) return [];
      if (segment.length <= 0) return [];
      const distance = projectOnPath(segment.coordinates, segment.lengths, vehicle.coordinates!);
      const offset = metersBetween(pointAtDistance(segment.coordinates, segment.lengths, distance).coordinates, vehicle.coordinates!);
      return [{ index, distance, offset }];
    }).sort((a, b) => a.offset - b.offset || Number(b.index === vehicle.segmentIndex) - Number(a.index === vehicle.segmentIndex));
    const match = candidates[0];
    if (!match || match.offset > 100) return result;
    result.segmentIndex = match.index;
    let speed = vehicle.speedKph;
    let basis: "reported-speed" | "observed-speed" = "reported-speed";
    if (speed === null && old?.coordinates && old.predictionAnchorAt && old.segmentIndex === match.index) {
      const elapsed = (now - Date.parse(old.predictionAnchorAt)) / 1000;
      const segment = segments[match.index];
      const before = projectOnPath(segment.coordinates, segment.lengths, old.coordinates);
      if (elapsed >= 1 && elapsed <= 30 && match.distance > before + 2) {
        speed = (match.distance - before) / elapsed * 3.6;
        basis = "observed-speed";
      }
    }
    // Zero speed is evidence of a stop. Do not guess when the bus will depart.
    if (speed === null || !Number.isFinite(speed) || speed <= 0 || speed > 70) return result;
    const current = segments[match.index];
    const currentSpeed = Math.min(speed, TRAFFIC_CAP_KPH[current.trafficLevel] ?? speed);
    const elapsed = Math.min(POSITION_HORIZON_MS, Math.max(0, now - anchorTime)) / 1000;
    const currentDistance = Math.min(current.length, match.distance + currentSpeed / 3.6 * elapsed);
    result.prediction = {
      segmentIndex: match.index, distanceAlongSegment: match.distance,
      speedKph: currentSpeed, anchorAt,
      validUntil: new Date(anchorTime + POSITION_HORIZON_MS).toISOString(), basis,
    };

    let seconds = 0;
    for (let step = 0; step < segments.length; step++) {
      const index = match.index + step;
      if (!loop && index >= segments.length) break;
      const segment = segments[index % segments.length];
      if (step > 0) {
        const last = segments[(index - 1) % segments.length];
        if (last.toStationCode !== segment.fromStationCode || metersBetween(last.coordinates.at(-1)!, segment.coordinates[0]) > 80) break;
        seconds += DWELL_SECONDS;
      }
      const cap = TRAFFIC_CAP_KPH[segment.trafficLevel];
      const modelSpeed = step === 0 ? currentSpeed : cap ? Math.min(cap, speed * .6 + cap * .4) : speed;
      seconds += (segment.length - (step === 0 ? currentDistance : 0)) / (modelSpeed / 3.6);
      if (seconds > 90 * 60) break;
      const stop = stops.find(item => item.stationCode === segment.toStationCode);
      if (!stop || stop.suspended) continue;
      const minutes = Math.max(1, Math.ceil(seconds / 60));
      if (!stop.arrivalEstimate || minutes < stop.arrivalEstimate.minutes) {
        stop.arrivalEstimate = { minutes, generatedAt: new Date(now).toISOString(), vehicleId: vehicle.id, basis };
      }
    }
    return result;
  });
  return { ...data, stops, vehicles };
}
