import "server-only";
import type { AssistantPlace } from "@/lib/assistant-journey";
import { searchBusStops, type BusNetwork } from "@/lib/bus-journey";
import { searchJourneyPlaces, type WalkingNetwork } from "@/lib/walking-network";

const normalize = (name: string) => name.toLocaleLowerCase().replace(/[\s\p{P}]/gu, "");

export function placesFor(query: string, bus: BusNetwork, walking: WalkingNetwork): AssistantPlace[] {
  const places = searchJourneyPlaces(walking.places, query);
  const exact = places.filter(p => [p.name, ...p.aliases].some(n => normalize(n) === normalize(query)));
  if (exact.length) return exact.map(({ id, name, coordinates }) => ({ id, name, coordinates }));
  const stops = searchBusStops(bus, query).map(s => ({ id: `stop:${s.stationCode}`, name: `${s.stationName} (${s.stationCode})`, coordinates: s.coordinates }));
  const exactStop = stops.find(s => s.id.toUpperCase() === `stop:${query}`.toUpperCase());
  return exactStop ? [exactStop] : [...places.map(({ id, name, coordinates }) => ({ id, name, coordinates })), ...stops].slice(0, 8);
}
export function placeById(id: string, bus: BusNetwork, walking: WalkingNetwork): AssistantPlace | undefined {
  if (id.startsWith("stop:")) return placesFor(id.slice(5), bus, walking).find(p => p.id === id);
  const p = walking.places.find(p => p.id === id);
  return p && { id: p.id, name: p.name, coordinates: p.coordinates };
}

