import { planBusJourneys, searchBusStops, type BusNetwork, type BusJourneyEndpoint } from "../../src/lib/bus-journey";
import { createWalkingRouter, searchJourneyPlaces, type WalkingNetwork } from "../../src/lib/walking-network";
import { buildJourneyMap } from "../../src/components/dashboard/journey-map";
import type { Coordinates } from "../../src/lib/resident-tools";

interface Choice { id: string; name: string; coordinates: Coordinates; stationCode?: string; context?: string }
let bus: BusNetwork | undefined;
let walking: WalkingNetwork | undefined;
let router: ReturnType<typeof createWalkingRouter> | undefined;

export function configure(busJSON: string, walkingJSON?: string) {
  bus = JSON.parse(busJSON) as BusNetwork;
  walking = walkingJSON ? JSON.parse(walkingJSON) as WalkingNetwork : undefined;
  router = walking ? createWalkingRouter(walking) : undefined;
}
export function search(query: string): string {
  const places: Choice[] = searchJourneyPlaces(walking?.places ?? [], query);
  const stops: Choice[] = bus ? searchBusStops(bus, query).map(stop => ({
    id: `stop:${stop.stationCode}`, name: stop.stationName, coordinates: stop.coordinates, stationCode: stop.stationCode,
  })) : [];
  return JSON.stringify([...places, ...stops]);
}
export function plan(input: string): string {
  if (!bus) throw new Error("Bus network unavailable");
  const { origin, destination, nearby, departureMinute } = JSON.parse(input) as {
    origin: Choice; destination: Choice; nearby: boolean; departureMinute: number;
  };
  const endpoint = (place: Choice): BusJourneyEndpoint => place.stationCode ? { stationCode: place.stationCode } : { coordinates: place.coordinates };
  const needsWalking = !origin.stationCode || !destination.stationCode;
  if (needsWalking && !router) throw new Error("Walking network unavailable");
  const access = router?.(origin.coordinates);
  const egress = router?.(destination.coordinates, true);
  const journeys = planBusJourneys(bus, endpoint(origin), endpoint(destination), {
    includeNearbyStops: nearby, departureMinute,
    walking: needsWalking && access && egress ? { access, egress } : undefined,
  });
  const direct = access?.(destination.coordinates);
  if (direct) journeys.push({ id: "walk", legs: [], totalStops: 0, accessMeters: 0, egressMeters: 0, transferMeters: 0, walking: { direct } });
  return JSON.stringify({ journeys, networkFetchedAt: bus.fetchedAt, walkingMappedAt: walking?.mappedAt });
}
export function geometry(input: string): string {
  const { locale, ...journey } = JSON.parse(input);
  return JSON.stringify(buildJourneyMap(journey, locale));
}
