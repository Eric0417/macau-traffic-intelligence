import { describe, expect, it } from "vitest";
import { distanceMeters, filterParking, stopKey, stopStatus } from "@/lib/resident-tools";
import type { BusEtaStop, ParkingFacility } from "@/lib/types";

const stop = { stationCode: "M1", sequence: 0, suspended: true, stopsAway: 0 } as BusEtaStop;
const facility = (id: string, count: number | null, coordinates: [number, number] | null) => ({
  id, name: id, coordinates, availability: { lightVehicle: count, motorcycle: 4 },
}) as ParkingFacility;

describe("resident tools", () => {
  it("gives a suspended stop priority over an approaching bus", () => {
    expect(stopStatus(stop)).toBe("suspended");
    expect(stopStatus({ ...stop, suspended: false })).toBe("due");
    expect(stopKey(stop)).toBe("0:M1");
  });

  it("uses geographic distance without presenting it as a walking route", () => {
    expect(distanceMeters([113.54, 22.2], [113.54, 22.2])).toBe(0);
    expect(distanceMeters([113.54, 22.2], [113.54, 22.21])).toBeCloseTo(1112, -1);
  });

  it("retains all car parks, puts unknown counts last and sorts by the chosen vehicle type", () => {
    const rows = Array.from({ length: 92 }, (_, index) => facility(String(index), index, null));
    expect(filterParking(rows, "", "lightVehicle", "spaces", null)).toHaveLength(92);
    expect(filterParking([facility("unknown", null, null), facility("zero", 0, null)], "", "lightVehicle", "spaces", null)[0].id).toBe("zero");
  });

  it("sorts mapped parks by proximity and leaves unmapped parks available", () => {
    const rows = [facility("far", 40, [113.6, 22.2]), facility("unknown", 99, null), facility("near", 1, [113.54, 22.2])];
    expect(filterParking(rows, "", "lightVehicle", "distance", [113.54, 22.2]).map((row) => row.id)).toEqual(["near", "far", "unknown"]);
  });
});
