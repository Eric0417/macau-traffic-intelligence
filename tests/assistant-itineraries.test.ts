import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as assistant from "@/server/sources/assistant";
import * as cache from "@/server/cache";
import { planAssistantJourney } from "@/server/sources/assistant-journeys";
import { tripDraftSchema } from "@/lib/itinerary";
import type { BusNetwork } from "@/lib/bus-journey";
import type { WalkingNetwork } from "@/lib/walking-network";

const points = [0, 1, 2, 3].map(i => ({ id: `p${i}`, name: `地點${i}`, coordinates: [113.54 + i * .005, 22.19] as [number, number], aliases: [], context: "" }));
const network: BusNetwork = { fetchedAt: "2026-11-14T00:00:00Z", coverage: { catalogRoutes: 1, loadedRoutes: 1, missingRoutes: [] }, routes: [{ routeName: "3", routeCode: "3", direction: 0, circular: false, company: { id: "a", name: "澳巴", color: "orange" }, stops: points.map(p => ({ stationCode: p.id, stationName: p.name, coordinates: p.coordinates })) }] };
const walking: WalkingNetwork = { mappedAt: network.fetchedAt, places: points, nodes: points.map(p => p.coordinates), edges: [[0, 1, 0, true], [1, 2, 0, true], [2, 3, 0, true]] };
const catalogue = points.slice(1).map((p, i) => ({ id: `culture:${p.id}`, placeId: p.id, name: p.name, nameEn: `Place ${i}`, tags: ["heritage"], opens: 540, closes: 1080, closedDays: i === 0 ? [3] : [], sourceUrl: "https://www.wh.gov.mo/cn/content/visitor/", checkedAt: "2026-11-14" }));
function sources() {
  vi.spyOn(cache, "readSource").mockImplementation(async source => ({ result: { data: source.id === "bus-network" ? network : source.id === "walking-network" ? walking : source.id === "cultural-places" ? catalogue : [], stale: false, updatedAt: network.fetchedAt } }) as never);
}
function transportAnswer(messages: Array<{ content: string }>) {
  const context = JSON.parse(messages[1].content);
  return JSON.stringify({ options: context.options.map((o: { id: string; sections: Array<{ candidates: unknown[] }> }) => ({ id: o.id, summary: "已連好整套交通", selections: o.sections.map(s => s.candidates.length ? 0 : null) })) });
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-14T06:00:00Z"));
  vi.spyOn(assistant, "callAssistantProvider").mockImplementation(async messages => transportAnswer(messages));
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it("keeps every named stop and return destination in the requested order", async () => {
  sources();
  const model = vi.spyOn(assistant, "callAssistantProvider").mockResolvedValueOnce(JSON.stringify({ intent: "itinerary", trip: { mode: "ordered", originQuery: "地點0", stops: [{ query: "地點2" }, { query: "地點1" }, { query: "地點0" }] } }));
  const { data } = await planAssistantJourney({ question: "由地點0去地點2，再去地點1再返地點0", locale: "zh-Hant" });
  expect(model).toHaveBeenCalledTimes(2);
  expect(data.kind).toBe("itineraries");
  if (data.kind !== "itineraries") return;
  expect(data.options[0].stops.map(s => s.id)).toEqual(["p0", "p2", "p1", "p0"]);
  expect(data.options[0].sections.map(s => [s.from.id, s.to.id])).toEqual([["p0", "p2"], ["p2", "p1"], ["p1", "p0"]]);
});

it("uses model-selected connections and derives the overview from them, ignoring contradictory prose", async () => {
  sources();
  vi.spyOn(assistant, "callAssistantProvider").mockImplementation(async messages => {
    const c = JSON.parse(messages[1].content);
    expect(c.options[0].sections).toHaveLength(2);
    return JSON.stringify({ options: [{ id: "ordered", summary: "搭虛構999號，全程步行", selections: c.options[0].sections.map((s: { candidates: Array<{ mode: string }> }) => {
      const bus = s.candidates.findIndex(j => j.mode === "bus");
      return bus >= 0 ? bus : 0;
    }) }] });
  });
  const { data } = await planAssistantJourney({ question: "幫我直接安排整條路線", locale: "zh-Hant", trip: { mode: "ordered", originQuery: "地點0", stops: [{ query: "地點2" }, { query: "地點1" }] } });
  expect(data.kind).toBe("itineraries");
  if (data.kind !== "itineraries") return;
  expect(data.options[0].reason).not.toContain("999");
  expect(data.options[0].reason).toContain("地點0 → 地點2：巴士 3");
  expect(data.options[0].reason).toContain("地點2 → 地點1：步行");
  expect(data.options[0].sections[0].journeys[0].legs[0].routeName).toBe("3");
});

it("rejects missing and out-of-range model connection choices", async () => {
  sources();
  const model = vi.spyOn(assistant, "callAssistantProvider");
  for (const selections of [[], [null], [6]]) {
    model.mockResolvedValue(JSON.stringify({ options: [{ id: "ordered", summary: "行程", selections }] }));
    await expect(planAssistantJourney({ question: "去地點2", locale: "zh-Hant", trip: { mode: "ordered", originQuery: "地點0", stops: [{ query: "地點2" }] } })).rejects.toThrow();
  }
});

it("asks once for a corrected complete selection without applying a partial model response", async () => {
  sources();
  const model = vi.spyOn(assistant, "callAssistantProvider").mockResolvedValueOnce(JSON.stringify({ options: [{ id: "ordered", selections: [0] }] }));
  const { data } = await planAssistantJourney({ question: "安排兩站", locale: "zh-Hant", trip: { mode: "ordered", originQuery: "地點0", stops: [{ query: "地點2" }, { query: "地點1" }] } });
  expect(data.kind).toBe("itineraries");
  expect(model).toHaveBeenCalledTimes(2);
  expect(model.mock.calls[1][0].at(-1)?.content).toContain("candidateCounts");
  if (data.kind === "itineraries") expect(data.options[0].sections).toHaveLength(2);
});

it("retains all destinations while asking for location and recovering with a manual origin", async () => {
  sources();
  const trip = tripDraftSchema.parse({ mode: "ordered", stops: [{ query: "地點1" }, { query: "地點2" }] });
  const { data } = await planAssistantJourney({ question: "去兩個地方", locale: "zh-Hant", trip });
  expect(data).toMatchObject({ kind: "trip-location", draft: { stops: trip.stops } });
  const recovered = await planAssistantJourney({ question: "去兩個地方", locale: "zh-Hant", trip: { ...trip, originQuery: "地點0" } });
  expect(recovered.data.kind).toBe("itineraries");
});

it("asks for missing day-trip details without calling the model or sources", async () => {
  const model = vi.spyOn(assistant, "callAssistantProvider");
  const read = vi.spyOn(cache, "readSource");
  const { data } = await planAssistantJourney({ question: "傳統文化一日遊", locale: "zh-Hant", trip: tripDraftSchema.parse({ mode: "day", theme: "傳統文化" }) });
  expect(data).toMatchObject({ kind: "trip-details", missing: ["date", "startTime", "endTime", "originQuery", "endQuery", "preferences"] });
  expect(model).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
});

const day = () => tripDraftSchema.parse({ mode: "day", theme: "文化", date: "2026-11-18", startTime: "09:00", endTime: "18:00", originQuery: "地點0", endQuery: "地點0", preferences: "輕鬆步行" });
it("excludes weekly closures and verifies complete day-trip alternatives and their return connection", async () => {
  sources();
  vi.spyOn(assistant, "callAssistantProvider").mockImplementation(async messages => {
    const context = JSON.parse(messages[1].content);
    if (context.options) return transportAnswer(messages);
    expect(context.places.some((p: { id: string }) => p.id === "culture:p1")).toBe(false);
    return JSON.stringify({ options: [
      { title: "兩站遊", reason: "兩處文化景點", visits: [{ id: "culture:p2", minutes: 45 }, { id: "culture:p3", minutes: 30 }] },
      { title: "慢遊", reason: "較少景點", visits: [{ id: "culture:p2", minutes: 60 }] },
    ] });
  });
  const { data } = await planAssistantJourney({ question: "文化遊", locale: "zh-Hant", trip: day() });
  expect(data.kind).toBe("itineraries");
  if (data.kind !== "itineraries") return;
  expect(data.options).toHaveLength(2);
  expect(data.options[0].stops.at(-1)?.id).toBe("p0");
  expect(data.options[0].sections).toHaveLength(3);
  expect(data.options[0].stops[1].targetTime).toMatch(/^\d\d:\d\d$/);
});

it("rejects invented attraction IDs instead of substituting another itinerary", async () => {
  sources();
  vi.spyOn(assistant, "callAssistantProvider").mockResolvedValue(JSON.stringify({ options: [{ title: "A", reason: "B", visits: [{ id: "invented", minutes: 30 }] }, { title: "C", reason: "D", visits: [{ id: "culture:p2", minutes: 30 }] }] }));
  await expect(planAssistantJourney({ question: "文化遊", locale: "zh-Hant", trip: day() })).rejects.toThrow();
});

it("retains unresolved sections instead of silently dropping destinations", async () => {
  sources();
  vi.spyOn(assistant, "callAssistantProvider").mockResolvedValue(JSON.stringify({ corrections: [{ query: "missing", searchQueries: [] }] }));
  const trip = tripDraftSchema.parse({ mode: "ordered", originQuery: "地點0", stops: [{ query: "missing" }, { query: "地點2" }] });
  const { data } = await planAssistantJourney({ question: "順序去", locale: "zh-Hant", trip });
  expect(data).toMatchObject({ kind: "trip-choice", field: 0, query: "missing", choices: [], draft: { stops: trip.stops } });
});

it("reschedules selected attractions and asks the model to reconnect transport", async () => {
  sources();
  const model = vi.spyOn(assistant, "callAssistantProvider");
  const trip = { ...day(), fixedStops: true, stops: [{ query: "地點2", placeId: "p2", stayMinutes: 120 }] };
  const { data } = await planAssistantJourney({ question: "留耐啲", locale: "zh-Hant", trip });
  expect(model).toHaveBeenCalledTimes(1);
  expect(data.kind).toBe("itineraries");
  if (data.kind !== "itineraries") return;
  expect(data.draft).toMatchObject({ mode: "day", fixedStops: true, date: trip.date });
  expect(data.options[0].stops[1]).toMatchObject({ stayMinutes: 120, sourceUrl: catalogue[1].sourceUrl });
  expect(data.options[0].stops[1].targetTime).toBeTruthy();
  const tooLate = await planAssistantJourney({ question: "縮短時間", locale: "zh-Hant", trip: { ...trip, startTime: "17:30", endTime: "18:00" } });
  expect(tooLate.data.kind).toBe("trip-details");
});

it("honours user stay durations when the model proposes a shorter visit", async () => {
  sources();
  vi.spyOn(assistant, "callAssistantProvider").mockResolvedValueOnce(JSON.stringify({ options: [
    { title: "A", reason: "B", visits: [{ id: "culture:p2", minutes: 15 }] },
    { title: "C", reason: "D", visits: [{ id: "culture:p2", minutes: 30 }, { id: "culture:p3", minutes: 30 }] },
  ] }));
  const { data } = await planAssistantJourney({ question: "地點2停兩個鐘", locale: "zh-Hant", trip: { ...day(), stops: [{ query: "地點2", stayMinutes: 120 }] } });
  expect(data.kind).toBe("itineraries");
  if (data.kind === "itineraries") for (const option of data.options) expect(option.stops.find(s => s.id === "p2")?.stayMinutes).toBe(120);
});

it("keeps disconnected transport sections visible and does not claim a complete connection", async () => {
  vi.spyOn(cache, "readSource").mockImplementation(async source => ({ result: { data: source.id === "bus-network" ? { ...network, routes: [] } : source.id === "walking-network" ? { ...walking, nodes: [[113.65, 22.28], [113.66, 22.28]], edges: [[0, 1, 0, true]] } : [], stale: false } }) as never);
  const { data } = await planAssistantJourney({ question: "由地點0去地點1再去地點2", locale: "zh-Hant", trip: tripDraftSchema.parse({ mode: "ordered", originQuery: "地點0", stops: [{ query: "地點1" }, { query: "地點2" }] }) });
  expect(data.kind).toBe("itineraries");
  if (data.kind !== "itineraries") return;
  expect(data.options[0].sections).toHaveLength(2);
  expect(data.options[0].sections.every(s => !s.journeys.length && s.warnings.some(w => w.includes("未搵到")))).toBe(true);
});

it("checks planned day-trip hours without treating current diversions as tomorrow's service", async () => {
  const read = vi.spyOn(cache, "readSource").mockImplementation(async source => ({ result: { data: source.id === "bus-network" ? { ...network, routes: network.routes.map(r => ({ ...r, serviceWindows: [[0, 60]] })) } : source.id === "walking-network" ? walking : source.id === "cultural-places" ? catalogue : [], stale: false, updatedAt: network.fetchedAt } }) as never);
  const { data } = await planAssistantJourney({ question: "文化遊", locale: "zh-Hant", trip: { ...day(), fixedStops: true, stops: [{ query: "地點2", placeId: "p2", stayMinutes: 60 }] } });
  expect(data.kind).toBe("itineraries");
  if (data.kind === "itineraries") expect(data.options[0].sections.every(s => s.journeys.every(j => !j.legs.length))).toBe(true);
  expect(read.mock.calls.every(([source]) => !source.id.startsWith("bus-diversion-"))).toBe(true);
});

it("does not introduce night buses on later sections of an afternoon ordered trip", async () => {
  vi.spyOn(cache, "readSource").mockImplementation(async source => ({ result: { data: source.id === "bus-network" ? { ...network, routes: [...network.routes, { ...network.routes[0], routeName: "N3", routeCode: "N3", serviceWindows: [[0, 360]] }] } : source.id === "walking-network" ? walking : [], stale: false } }) as never);
  const { data } = await planAssistantJourney({ question: "下午出發", locale: "zh-Hant", trip: { mode: "ordered", originQuery: "地點0", stops: [{ query: "地點1", stayMinutes: 60 }, { query: "地點3" }] } });
  expect(data.kind).toBe("itineraries");
  if (data.kind !== "itineraries") return;
  expect(data.options[0].sections[1].journeys.some(j => j.legs.some(l => l.routeName === "N3"))).toBe(false);
});

it("retains repeated visits and their separate stay lengths when a day trip is explicitly edited", async () => {
  sources();
  const { data } = await planAssistantJourney({ question: "之後再返地點2", locale: "zh-Hant", trip: { ...day(), fixedStops: true, stops: [
    { query: "地點2", placeId: "p2", stayMinutes: 30 }, { query: "地點3", placeId: "p3", stayMinutes: 45 }, { query: "地點2", placeId: "p2", stayMinutes: 60 },
  ] } });
  expect(data.kind).toBe("itineraries");
  if (data.kind !== "itineraries") return;
  expect(data.options[0].stops.filter(s => s.visit).map(s => [s.id, s.stayMinutes])).toEqual([["p2", 30], ["p3", 45], ["p2", 60]]);
});
