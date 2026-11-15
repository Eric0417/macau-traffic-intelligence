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
  unavailableStops?: ReadonlyMap<string, ReadonlySet<string>>;
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

export const BUS_JOURNEY_ACCESS_METERS = 1_000;
const MAX_BUS_LEGS = 4;
const MAX_JOURNEYS = 6;
const journeyOrder = new Intl.Collator("en", { numeric: true });

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
  const hasHours = (plan: BusJourney) => plan.legs.every((item) => item.serviceWindows);
  // Comparison points, not minutes: a transfer costs six stop edges and
  // 100 m of endpoint walking costs one. Avoid saving one stop by changing bus.
  const score = (plan: BusJourney) => plan.totalStops + (plan.accessMeters + plan.egressMeters) / 100 + Math.max(0, plan.legs.length - 1) * 6;
  const compare = (a: BusJourney, b: BusJourney) =>
    (options.departureMinute === undefined ? 0 : Number(hasHours(b)) - Number(hasHours(a))) ||
    score(a) - score(b) || a.legs.length - b.legs.length ||
    journeyOrder.compare(a.id, b.id);
  const departures = new Map<string, BusJourneyLeg[]>();
  for (const route of network.routes) {
    if (options.departureMinute !== undefined && route.serviceWindows &&
        !coversDeparture(route.serviceWindows, options.departureMinute)) continue;
    for (let from = 0; from < route.stops.length - 1; from++) {
      const station = route.stops[from].stationCode;
      if (options.unavailableStops?.get(route.routeName)?.has(station)) continue;
      const legs = departures.get(station) ?? [];
      for (let to = from + 1; to < route.stops.length; to++) {
        if (route.stops[to].stationCode === station || options.unavailableStops?.get(route.routeName)?.has(route.stops[to].stationCode)) continue;
        legs.push(leg(route, from, to));
      }
      departures.set(station, legs);
    }
  }
  let frontier = new Map<string, BusJourney[]>();
  for (const [station, accessMeters] of starts) {
    frontier.set(station, [{ id: "", legs: [], accessMeters, egressMeters: 0, transferMeters: 0, totalStops: 0 }]);
  }
  const plans: BusJourney[] = [];
  // Each round boards one bus. Keep the cheapest arrival for each last route
  // and reviewed-hours state: subsequent boarding costs depend only on these.
  for (let round = 0; round < MAX_BUS_LEGS && frontier.size; round++) {
    const next = new Map<string, Map<string, BusJourney>>();
    for (const [station, arrivals] of frontier) {
      for (const arrival of arrivals) for (const item of departures.get(station) ?? []) {
        if (arrival.legs.at(-1)?.routeCode === item.routeCode) continue;
        const plan: BusJourney = {
          id: `${arrival.id ? `${arrival.id}|` : ""}${item.routeCode}:${item.direction}:${item.fromSequence}-${item.toSequence}`,
          legs: [...arrival.legs, item], accessMeters: arrival.accessMeters, egressMeters: 0, transferMeters: 0,
          totalStops: arrival.totalStops + item.stopCount,
        };
        const end = item.to.stationCode;
        const egress = ends.get(end);
        if (egress !== undefined && plan.legs[0].from.stationCode !== end &&
            new Set(plan.legs.map(l => l.routeCode)).size === plan.legs.length) {
          plans.push({ ...plan, egressMeters: egress });
        }
        const labels = next.get(end) ?? new Map<string, BusJourney>();
        const key = `${item.routeCode}:${Number(hasHours(plan))}`;
        const previous = labels.get(key);
        if (!previous || compare(plan, previous) < 0) labels.set(key, plan);
        next.set(end, labels);
      }
    }
    frontier = new Map([...next].map(([station, labels]) => [station, [...labels.values()]]));
  }
  plans.sort(compare);
  const seen = new Set<string>();
  const distinct = plans.filter((plan) => {
    const buses = plan.legs.map((item) => `${item.routeCode}:${item.direction}`).join("|");
    const key = buses;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const selected: BusJourney[] = [];
  for (const plan of distinct) {
    // Do not offer extra changes when an already selected route sequence
    // covers the same trip with no more stops or walking.
    if (selected.some(other => {
      if (other.legs.length >= plan.legs.length || other.totalStops > plan.totalStops ||
          other.accessMeters > plan.accessMeters || other.egressMeters > plan.egressMeters) return false;
      let index = 0;
      for (const item of plan.legs) if (item.routeCode === other.legs[index]?.routeCode && item.direction === other.legs[index]?.direction) index++;
      return index === other.legs.length;
    })) continue;
    selected.push(plan);
    if (selected.length === MAX_JOURNEYS) break;
  }
  // Keep a direct option for comparison even when shorter transfers fill the list.
  const direct = distinct.find(plan => plan.legs.length === 1);
  if (direct && !selected.some(plan => plan.legs.length === 1)) selected[selected.length - 1] = direct;
  return selected.map((plan) => {
    if (!options.walking) return plan;
    const access = accessPaths.get(plan.legs[0].from.stationCode);
    const egress = egressPaths.get(plan.legs.at(-1)!.to.stationCode);
    return { ...plan, walking: { access, egress } };
  });
}
