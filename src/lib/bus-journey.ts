import type { BusCompany } from "@/lib/types";
import { distanceMeters, type Coordinates } from "./resident-tools";
import type { WalkingPath } from "./walking-network";

export interface BusJourneyStop {
  stationCode: string;
  stationName: string;
  coordinates: Coordinates;
}

export interface BusJourneyRoute {
  routeCode: string;
  routeName: string;
  direction: 0 | 1;
  circular: boolean;
  company: BusCompany;
  stops: BusJourneyStop[];
  /** Reviewed first and last departure minutes at the terminus, Macau time. */
  serviceWindows?: Array<[number, number]>;
}

export interface BusNetwork {
  fetchedAt: string;
  routes: BusJourneyRoute[];
  coverage: { catalogRoutes: number; loadedRoutes: number; missingRoutes: string[] };
}

export type BusJourneyEndpoint = { stationCode: string } | { coordinates: Coordinates };
export interface BusJourneyOptions {
  includeNearbyStops?: boolean;
  departureMinute?: number;
  walking?: {
    access?: (coordinates: Coordinates) => WalkingPath | null;
    egress?: (coordinates: Coordinates) => WalkingPath | null;
  };
}

export interface BusJourneyLeg {
  routeCode: string;
  routeName: string;
  direction: 0 | 1;
  terminalName: string;
  circular: boolean;
  from: BusJourneyStop;
  to: BusJourneyStop;
  // Indices in this dated stop list. A refreshed live list can have changed.
  fromSequence: number;
  toSequence: number;
  stopCount: number;
  serviceWindows?: BusJourneyRoute["serviceWindows"];
}

export interface BusJourney {
  id: string;
  legs: BusJourneyLeg[];
  accessMeters: number;
  egressMeters: number;
  transferMeters: number;
  totalStops: number;
  walking?: { access?: WalkingPath; egress?: WalkingPath; direct?: WalkingPath };
}

export const BUS_JOURNEY_ACCESS_METERS = 500;
const MAX_JOURNEYS = 6;

function coversDeparture(windows: NonNullable<BusJourneyRoute["serviceWindows"]>, minute: number): boolean {
  return windows.some(([start, end]) =>
    start <= end ? minute >= start && minute <= end : minute >= start || minute <= end,
  );
}

function uniqueStops(network: BusNetwork): BusJourneyStop[] {
  const stops = new Map<string, BusJourneyStop>();
  for (const route of network.routes) for (const stop of route.stops) {
    if (!stops.has(stop.stationCode)) stops.set(stop.stationCode, stop);
  }
  return [...stops.values()];
}

export function searchBusStops(network: BusNetwork, query: string): BusJourneyStop[] {
  const needle = query.trim().toLocaleUpperCase();
  if (!needle) return [];
  return uniqueStops(network).filter((stop) =>
    stop.stationCode.toLocaleUpperCase().includes(needle) || stop.stationName.toLocaleUpperCase().includes(needle),
  ).sort((a, b) => Number(b.stationCode === needle) - Number(a.stationCode === needle) || a.stationCode.localeCompare(b.stationCode, "en", { numeric: true })).slice(0, 30);
}

function endpointStops(
  network: BusNetwork,
  endpoint: BusJourneyEndpoint,
  includeNearbyStops: boolean,
  walk?: (coordinates: Coordinates) => WalkingPath | null,
) {
  const paths = new Map<string, WalkingPath>();
  if ("stationCode" in endpoint && !includeNearbyStops) {
    return { distances: new Map([[endpoint.stationCode.trim().toUpperCase(), 0]]), paths };
  }
  const stops = uniqueStops(network);
  const coordinates = "coordinates" in endpoint ? endpoint.coordinates : stops.find((stop) => stop.stationCode === endpoint.stationCode.trim().toUpperCase())?.coordinates;
  const distances = new Map<string, number>();
  if (!coordinates) return { distances, paths };
  for (const stop of stops) {
    const distance = distanceMeters(coordinates, stop.coordinates);
    if (distance > BUS_JOURNEY_ACCESS_METERS) continue;
    if (!walk || distance <= 1) {
      distances.set(stop.stationCode, Math.round(distance));
      continue;
    }
    const path = walk(stop.coordinates);
    if (!path || path.meters > 1_000) continue;
    distances.set(stop.stationCode, path.meters);
    paths.set(stop.stationCode, path);
  }
  return { distances, paths };
}

function leg(route: BusJourneyRoute, from: number, to: number): BusJourneyLeg {
  return {
    routeCode: route.routeCode, routeName: route.routeName, direction: route.direction,
    terminalName: route.stops.at(-1)!.stationName,
    circular: route.circular,
    from: route.stops[from], to: route.stops[to], fromSequence: from, toSequence: to,
    stopCount: to - from,
    serviceWindows: route.serviceWindows,
  };
}

/** Published bus stop order with optional mapped access and egress paths. */
export function planBusJourneys(network: BusNetwork, origin: BusJourneyEndpoint, destination: BusJourneyEndpoint, options: BusJourneyOptions = {}): BusJourney[] {
  const { distances: starts, paths: accessPaths } = endpointStops(network, origin, options.includeNearbyStops ?? false, options.walking?.access);
  const { distances: ends, paths: egressPaths } = endpointStops(network, destination, options.includeNearbyStops ?? false, options.walking?.egress);
  const firstLegs = new Map<string, Array<{ leg: BusJourneyLeg; access: number }>>();
  const secondLegs = new Map<string, Array<{ leg: BusJourneyLeg; egress: number }>>();
  const plans: BusJourney[] = [];
  const add = (legs: BusJourneyLeg[], accessMeters: number, egressMeters: number) => {
    plans.push({
      id: legs.map((item) => `${item.routeCode}:${item.direction}:${item.fromSequence}-${item.toSequence}`).join("|"),
      legs, accessMeters, egressMeters, transferMeters: 0,
      totalStops: legs.reduce((total, item) => total + item.stopCount, 0),
    });
  };
  for (const route of network.routes) {
    if (options.departureMinute !== undefined && route.serviceWindows &&
        !coversDeparture(route.serviceWindows, options.departureMinute)) continue;
    for (let from = 0; from < route.stops.length - 1; from += 1) {
      const access = starts.get(route.stops[from].stationCode);
      for (let to = from + 1; to < route.stops.length; to += 1) {
        const egress = ends.get(route.stops[to].stationCode);
        if (access === undefined && egress === undefined) continue;
        const item = leg(route, from, to);
        if (access !== undefined) {
          const candidates = firstLegs.get(item.to.stationCode) ?? [];
          candidates.push({ leg: item, access });
          firstLegs.set(item.to.stationCode, candidates);
          if (egress !== undefined && item.from.stationCode !== item.to.stationCode) add([item], access, egress);
        }
        if (egress !== undefined) {
          const candidates = secondLegs.get(item.from.stationCode) ?? [];
          candidates.push({ leg: item, egress });
          secondLegs.set(item.from.stationCode, candidates);
        }
      }
    }
  }
  for (const [stationCode, arrivals] of firstLegs) {
    for (const arrival of arrivals) for (const departure of secondLegs.get(stationCode) ?? []) {
      if (arrival.leg.routeCode === departure.leg.routeCode) continue;
      if (arrival.leg.from.stationCode === departure.leg.to.stationCode) continue;
      add([arrival.leg, departure.leg], arrival.access, departure.egress);
    }
  }
  const hasHours = (plan: BusJourney) => plan.legs.every((item) => item.serviceWindows);
  plans.sort((a, b) =>
    (options.departureMinute === undefined ? 0 : Number(hasHours(b)) - Number(hasHours(a))) ||
    a.totalStops - b.totalStops ||
    (a.accessMeters + a.egressMeters) - (b.accessMeters + b.egressMeters) ||
    a.legs.length - b.legs.length || a.id.localeCompare(b.id, "en", { numeric: true }));
  const seen = new Set<string>();
  return plans.filter((plan) => {
    const buses = plan.legs.map((item) => `${item.routeCode}:${item.direction}`).join("|");
    const key = buses;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_JOURNEYS).map((plan) => {
    if (!options.walking) return plan;
    const access = accessPaths.get(plan.legs[0].from.stationCode);
    const egress = egressPaths.get(plan.legs.at(-1)!.to.stationCode);
    return { ...plan, walking: { access, egress } };
  });
}
