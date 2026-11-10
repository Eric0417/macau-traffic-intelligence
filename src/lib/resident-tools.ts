import type { BusEtaStop, ParkingAvailability, ParkingFacility } from "@/lib/types";

export type Coordinates = [number, number];
export type ParkingKind = keyof ParkingAvailability;

export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const radians = Math.PI / 180;
  const dLat = (b[1] - a[1]) * radians;
  const dLng = (b[0] - a[0]) * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function stopKey(stop: Pick<BusEtaStop, "sequence" | "stationCode">): string {
  return `${stop.sequence}:${stop.stationCode}`;
}

export function stopStatus(stop: BusEtaStop): "suspended" | "due" | "waiting" | "unknown" {
  if (stop.suspended) return "suspended";
  if (stop.stopsAway === 0) return "due";
  return stop.stopsAway === null ? "unknown" : "waiting";
}

export function filterParking(
  facilities: ParkingFacility[], query: string, kind: ParkingKind,
  sort: "spaces" | "distance", location: Coordinates | null,
): ParkingFacility[] {
  const needle = query.trim().toLowerCase();
  return facilities.filter((facility) => facility.name.toLowerCase().includes(needle)).sort((a, b) => {
    if (sort === "distance" && location) {
      const aDistance = a.coordinates ? distanceMeters(location, a.coordinates) : Infinity;
      const bDistance = b.coordinates ? distanceMeters(location, b.coordinates) : Infinity;
      if (aDistance !== bDistance) return aDistance - bDistance;
    }
    return (b.availability[kind] ?? -1) - (a.availability[kind] ?? -1);
  });
}
