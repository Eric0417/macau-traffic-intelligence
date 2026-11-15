import type { BusEta, BusEtaStop, BusVehicle } from "./types";
import { metersBetween, pathLengths, pointAtDistance, projectOnPath } from "./route-geometry";

// These are model assumptions, not calibrated travel-time measurements.
const TRAFFIC_CAP_KPH: Record<number, number> = { 1: 28, 2: 18, 3: 10, 4: 5 };
const DWELL_SECONDS = 20;
const POSITION_HORIZON_MS = 15_000;
const UNCHANGED_LIMIT_MS = 30_000;
const HISTORY_LIMIT_MS = 60_000;
const STOP_PASS_METERS = 20;

function fresh(timestamp: string, now: number, limit = 10_000) {
  const age = now - Date.parse(timestamp);
  // The UI clock ticks every two seconds; a response can precede its next tick.
  return age >= -2000 && age <= limit;
}

export function usableArrivalEstimate(stop: BusEtaStop, now = Date.now()) {
  return !stop.suspended && stop.arrivalEstimate && fresh(stop.arrivalEstimate.generatedAt, now) ? stop.arrivalEstimate : null;
}

export function usableArrivalStatus(stop: BusEtaStop, now = Date.now()) {
  return !stop.suspended && stop.arrivalStatus && fresh(stop.arrivalStatus.generatedAt, now) ? stop.arrivalStatus : null;
}

export function predictBusArrivals(data: BusEta, loop: boolean, now: number, previous?: BusEta): BusEta {
  let total = 0;
  const segments = data.routeSegments.map(segment => {
    const lengths = pathLengths(segment.coordinates);
    const length = lengths.at(-1) ?? 0;
    const start = total;
    total += length;
    return { ...segment, lengths, length, start };
  });
  const geometry = (eta: BusEta) => JSON.stringify(eta.routeSegments.map(s => [s.fromStationCode, s.toStationCode, s.coordinates]));
  const history = previous?.routeCode === data.routeCode && previous.direction === data.direction && geometry(previous) === geometry(data) ? previous : undefined;
  if (history?.vehicles.some(vehicle => vehicle.tracking && Date.parse(vehicle.tracking.updatedAt) > now)) return history;
  const timestamp = new Date(now).toISOString();
  const stops = data.stops.map(stop => ({ ...stop, arrivalEstimate: null as BusEtaStop["arrivalEstimate"], arrivalStatus: null as BusEtaStop["arrivalStatus"] }));
  const candidates = new Map<string, { distance: number; seconds: number | null; vehicle: BusVehicle; stopProgress: number; nearStop: boolean }[]>();
  const vehicles = data.vehicles.map((vehicle): BusVehicle => {
    const old = history?.vehicles.find(item => item.id === vehicle.id && item.plate === vehicle.plate);
    const unchanged = old?.coordinates && vehicle.coordinates && metersBetween(old.coordinates, vehicle.coordinates) < 2;
    const prior = old?.tracking && (fresh(old.tracking.updatedAt, now, HISTORY_LIMIT_MS) || unchanged) ? old.tracking : null;
    const result: BusVehicle = { ...vehicle, tracking: prior, prediction: null, segmentIndex: prior?.segmentIndex ?? vehicle.segmentIndex };
    const lap = prior && total > 0 ? Math.round((prior.progress - segments[prior.segmentIndex].start - prior.distanceAlongSegment) / total) : 0;
    const elapsed = prior ? Math.max(0, (now - Date.parse(prior.observedAt)) / 1000) : 0;
    const maxAdvance = elapsed * 70 / 3.6 + 25;
    const matches = vehicle.positionSource === "feed" && vehicle.coordinates ? segments.flatMap((segment, index) => {
      if (segment.length <= 0) return [];
      if (index !== vehicle.segmentIndex && index !== prior?.segmentIndex && segment.fromStationCode !== vehicle.stationCode && segment.toStationCode !== vehicle.stationCode) return [];
      let start = segment.start + lap * total;
      // A lap rollover requires a position near the terminal, not a large rewind.
      if (prior && loop && index < prior.segmentIndex && prior.progress - start > total / 2) start += total;
      const min = prior ? Math.max(0, prior.progress - 20 - start) : 0;
      const max = prior ? Math.min(segment.length, prior.progress + maxAdvance - start) : segment.length;
      if (min > max || max < 0 || min > segment.length) return [];
      const distance = projectOnPath(segment.coordinates, segment.lengths, vehicle.coordinates!, { min, max });
      const offset = metersBetween(pointAtDistance(segment.coordinates, segment.lengths, distance).coordinates, vehicle.coordinates!);
      return [{ index, distance, offset, progress: start + distance }];
    }).filter(match => match.offset <= 100).sort((a, b) => a.offset - b.offset || Number(b.index === prior?.segmentIndex) - Number(a.index === prior?.segmentIndex)) : [];
    let match = matches[0];
    // Keep a stop boundary until a new position clears its 20 m uncertainty zone.
    if (match && prior && match.index !== prior.segmentIndex && match.progress >= prior.progress) {
      const boundary = prior.progress - prior.distanceAlongSegment + segments[prior.segmentIndex].length;
      if (match.progress <= boundary + STOP_PASS_METERS) {
        match = { ...match, index: prior.segmentIndex, distance: segments[prior.segmentIndex].length, progress: boundary };
      }
    }
    const accepted = match && (!prior || match.progress >= prior.progress - 20);
    let speed = vehicle.speedKph;
    let basis: "reported-speed" | "observed-speed" = "reported-speed";
    if (speed === null && accepted && prior && elapsed >= 1 && elapsed <= 30 && match.progress > prior.progress + 2) {
      speed = (match.progress - prior.progress) / elapsed * 3.6;
      basis = "observed-speed";
    }
    if (speed !== null && (!Number.isFinite(speed) || speed < 0 || speed > 70)) speed = null;
    if (accepted) {
      const forward = !prior || match.progress > prior.progress + 2;
      const progress = prior && !forward ? prior.progress : match.progress;
      const index = prior && !forward ? prior.segmentIndex : match.index;
      const distance = prior && !forward ? prior.distanceAlongSegment : match.distance;
      const dt = prior ? Math.max(0, (now - Date.parse(prior.updatedAt)) / 1000) : 0;
      const alpha = 1 - Math.exp(-dt / 30);
      // Retain a moving-speed history through a stop, without predicting departure.
      const modelSpeed = speed && prior?.speedKph ? prior.speedKph + alpha * (speed - prior.speedKph) : speed || prior?.speedKph || null;
      result.tracking = { segmentIndex: index, distanceAlongSegment: distance, progress, observedAt: forward ? timestamp : prior!.observedAt, updatedAt: timestamp, startedAt: prior?.startedAt ?? timestamp, speedKph: modelSpeed };
    }
    const track = result.tracking;
    if (!track) return result;
    result.segmentIndex = track.segmentIndex;
    result.predictionAnchorAt = track.observedAt;
    const current = segments[track.segmentIndex];
    const positionFresh = Boolean(accepted && fresh(track.observedAt, now, UNCHANGED_LIMIT_MS));
    const moving = positionFresh && speed !== null && speed > 0;
    const currentSpeed = moving ? Math.min(speed!, TRAFFIC_CAP_KPH[current.trafficLevel] ?? speed!) : 0;
    if (moving && fresh(track.observedAt, now, POSITION_HORIZON_MS)) {
      result.prediction = { segmentIndex: track.segmentIndex, distanceAlongSegment: track.distanceAlongSegment, speedKph: currentSpeed, anchorAt: track.observedAt, validUntil: new Date(Date.parse(track.observedAt) + POSITION_HORIZON_MS).toISOString(), basis };
    }
    // Stop selection uses accepted coordinates, never extrapolated positions.
    let distance = 0;
    let seconds: number | null = moving && track.speedKph ? 0 : null;
    for (let step = 0; step < segments.length; step++) {
      const index = track.segmentIndex + step;
      if (!loop && index >= segments.length) break;
      const segment = segments[index % segments.length];
      if (segment.length <= 0) continue;
      if (step > 0) {
        const last = segments[(index - 1) % segments.length];
        if (last.toStationCode !== segment.fromStationCode || metersBetween(last.coordinates.at(-1)!, segment.coordinates[0]) > 80) break;
        if (seconds !== null) seconds += DWELL_SECONDS;
      }
      const remaining = segment.length - (step === 0 ? track.distanceAlongSegment : 0);
      distance += remaining;
      const cap = TRAFFIC_CAP_KPH[segment.trafficLevel];
      const modelSpeed = step === 0 ? Math.min(track.speedKph ?? 0, cap ?? Infinity)
        : cap ? Math.min(cap, (track.speedKph ?? 0) * .6 + cap * .4) : track.speedKph ?? 0;
      if (seconds !== null) seconds += remaining / (modelSpeed / 3.6);
      const stop = stops.find(item => item.stationCode === segment.toStationCode);
      if (!stop || stop.suspended) continue;
      const list = candidates.get(stop.stationCode) ?? [];
      list.push({ distance, seconds: seconds !== null && seconds <= 90 * 60 ? seconds : null, vehicle: result, stopProgress: track.progress + distance, nearStop: positionFresh && speed === 0 && distance <= 60 });
      candidates.set(stop.stationCode, list);
    }
    return result;
  });
  for (const stop of stops) {
    if (stop.suspended) continue;
    const choice = candidates.get(stop.stationCode)?.sort((a, b) => a.distance - b.distance)[0];
    const oldStop = history?.stops.find(item => item.stationCode === stop.stationCode);
    const last = oldStop?.arrivalEstimate ?? oldStop?.arrivalStatus;
    // A briefly missing position is not evidence that the bus passed the stop.
    const lastVehicleMissing = last && !vehicles.some(v => v.id === last.vehicleId && v.tracking);
    const since = oldStop?.arrivalStatus?.since ?? last?.generatedAt;
    if (last && since && lastVehicleMissing && fresh(since, now, UNCHANGED_LIMIT_MS)) {
      stop.arrivalStatus = { state: "updating", vehicleId: last.vehicleId, stopProgress: last.stopProgress, since, generatedAt: timestamp, nextBus: last.nextBus };
      continue;
    }
    if (!choice) continue;
    const sameArrival = last?.vehicleId === choice.vehicle.id && last.stopProgress !== undefined && Math.abs(last.stopProgress - choice.stopProgress) < 1;
    const nextBus = Boolean(last && (!sameArrival || last.nextBus));
    if (choice.seconds === null) {
      stop.arrivalStatus = { state: choice.nearStop ? "near-stop" : "updating", vehicleId: choice.vehicle.id, stopProgress: choice.stopProgress, since: sameArrival && oldStop?.arrivalStatus ? oldStop.arrivalStatus.since : timestamp, generatedAt: timestamp, nextBus };
      continue;
    }
    let arrivalAt = now + choice.seconds * 1000;
    const before = oldStop?.arrivalEstimate;
    if (sameArrival && before?.arrivalAt && fresh(before.generatedAt, now, HISTORY_LIMIT_MS)) {
      const alpha = 1 - Math.exp(-Math.max(0, now - Date.parse(before.generatedAt)) / 15_000);
      arrivalAt = Date.parse(before.arrivalAt) + alpha * (arrivalAt - Date.parse(before.arrivalAt));
    }
    stop.arrivalEstimate = { minutes: Math.max(1, Math.ceil((arrivalAt - now) / 60_000)), generatedAt: timestamp, vehicleId: choice.vehicle.id, basis: choice.vehicle.prediction?.basis ?? "reported-speed", stopProgress: choice.stopProgress, arrivalAt: new Date(arrivalAt).toISOString(), nextBus };
  }
  return { ...data, stops, vehicles };
}
