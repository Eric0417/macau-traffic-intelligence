import { describe, expect, it } from "vitest";
import { trainCarPoses } from "@/components/dashboard/vehicle-3d";
import { metersBetween, pathLengths } from "@/components/dashboard/bus-motion";

describe("readable schematic models", () => {
  it("gives each train car its own heading through a bend", () => {
    const path: Array<[number, number]> = [[113.55,22.19], [113.55,22.191], [113.551,22.191]];
    const lengths = pathLengths(path);
    const cars = trainCarPoses(path, lengths[1], 30);
    expect(cars[0].bearing).toBeCloseTo(90, 1);
    expect(cars[1].bearing).toBeCloseTo(0, 1);
    expect(cars[0].coordinates[1]).toBeCloseTo(22.191, 6);
    expect(cars[1].coordinates[0]).toBeCloseTo(113.55, 6);
    expect(metersBetween(cars[0].coordinates, cars[1].coordinates)).toBeLessThan(30);
  });

  it("keeps both car centres inside the rail at the terminus", () => {
    const path: Array<[number, number]> = [[113.55,22.19], [113.55,22.191]];
    for (const distance of [-10, 0, 10_000]) {
      const cars = trainCarPoses(path, distance, 30);
      expect(cars.every((car) => car.coordinates[1] >= 22.19 && car.coordinates[1] <= 22.191)).toBe(true);
      expect(metersBetween(cars[0].coordinates,cars[1].coordinates)).toBeCloseTo(30, 0);
    }
  });
});
