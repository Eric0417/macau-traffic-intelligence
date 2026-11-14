import { expect, it } from "vitest";
import { missingTripDetails, scheduleVisits, tripDraftSchema } from "@/lib/itinerary";

it("asks for day-trip details before generating destinations", () => {
  const draft = tripDraftSchema.parse({ mode: "day", theme: "傳統文化" });
  expect(missingTripDetails(draft)).toEqual(["date", "startTime", "endTime", "originQuery", "endQuery", "preferences"]);
  expect(missingTripDetails(tripDraftSchema.parse({ mode: "ordered", stops: [{ query: "運動場" }, { query: "媽閣" }] }))).toEqual([]);
});

it("preserves ordered return visits and rejects oversized or invalid drafts", () => {
  expect(tripDraftSchema.parse({ mode: "ordered", stops: [{ query: "A" }, { query: "B" }, { query: "A" }] }).stops.map(s => s.query)).toEqual(["A", "B", "A"]);
  expect(tripDraftSchema.safeParse({ mode: "ordered", stops: Array.from({ length: 9 }, () => ({ query: "A" })) }).success).toBe(false);
  expect(tripDraftSchema.safeParse({ mode: "day", date: "2026-02-30" }).success).toBe(false);
  expect(tripDraftSchema.safeParse({ mode: "day", startTime: "25:00" }).success).toBe(false);
});

it("fits visits inside opening and last-admission windows without inventing transport minutes", () => {
  const slots = scheduleVisits([{ minutes: 45, opens: 600, closes: 1080, lastAdmission: 1050 }, { minutes: 30, opens: 480, closes: 1020 }], "09:00", "18:00");
  expect(slots).not.toBeNull();
  expect(slots![0]).toBeGreaterThanOrEqual(600);
  expect(slots![1] + 30).toBeLessThanOrEqual(1020);
  expect(scheduleVisits([{ minutes: 60, opens: 600, closes: 1080, lastAdmission: 1050 }], "17:40", "18:00")).toBeNull();
  expect(scheduleVisits([{ minutes: 60, opens: 0, closes: 1440 }], "18:00", "09:00")).toBeNull();
});
