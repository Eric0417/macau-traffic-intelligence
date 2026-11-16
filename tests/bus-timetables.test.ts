import { describe, expect, it } from "vitest";
import { busTimetableSchema } from "@/lib/contracts";
import snapshot from "../data/bus-timetables.json";

describe("reviewed DSAT timetable snapshot", () => {
  it("validates every timetable and links its own official route", () => {
    expect(Object.keys(snapshot)).toHaveLength(90);
    for (const [route, value] of Object.entries(snapshot)) {
      const timetable = busTimetableSchema.parse(value);
      expect(timetable.sourceUrl.endsWith(`?route=busroute_${route}`)).toBe(true);
      expect(timetable.checkedAt).toBe("2026-11-16");
    }
  });
  it("preserves split service, holiday restrictions, and fixed departures", () => {
    expect(snapshot["59"].schedules[0].periods).toEqual([{ start: "06:10", end: "10:00" }, { start: "15:00", end: "19:30" }]);
    expect(snapshot["25BS"].schedules[0].days).toBe("mon-sat-except-mandatory");
    expect(snapshot["701XS"].schedules[0].days).toBe("mon-fri-except-public-and-um");
    expect(snapshot["71S"].schedules[0].periods).toEqual([{ start: "08:25" }, { start: "08:40" }]);
  });
  it("keeps different terminal hours and midnight endpoints", () => {
    expect(snapshot["3"].schedules.map((s) => s.periods)).toEqual([[{ start: "06:00", end: "01:15" }], [{ start: "05:45", end: "00:45" }]]);
    expect(snapshot["56"].schedules[0].periods).toEqual([{ start: "06:00", end: "00:00" }]);
    expect(snapshot["60"].schedules[0].periods).toEqual([{ start: "06:00", end: "23:45" }]);
  });
});
