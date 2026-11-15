import { afterEach, expect, it, vi } from "vitest";
import * as assistant from "@/server/sources/assistant";
import * as cache from "@/server/cache";
import { planAssistantJourney } from "@/server/sources/assistant-journeys";
import type { BusNetwork } from "@/lib/bus-journey";
import type { WalkingNetwork } from "@/lib/walking-network";
import { placesFor } from "@/server/sources/journey-places";

const places = [
  { id: "school", name: "澳門培正中學", coordinates: [113.548, 22.201] as [number, number], aliases: [], context: "" },
  { id: "temple", name: "媽閣廟", coordinates: [113.531, 22.186] as [number, number], aliases: [], context: "" },
  { id: "station", name: "媽閣", coordinates: [113.531, 22.184] as [number, number], aliases: [], context: "" },
];
const bus: BusNetwork = { fetchedAt: "2026-11-14T00:00:00Z", routes: [], coverage: { catalogRoutes: 0, loadedRoutes: 0, missingRoutes: [] } };
const walking: WalkingNetwork = { mappedAt: bus.fetchedAt, places, nodes: places.map(p => p.coordinates), edges: [[0, 1, 0, true], [1, 2, 0, true]] };
function sources() {
  vi.spyOn(cache, "readSource").mockImplementation(async source => ({ result: { data: source.id === "bus-network" ? bus : walking, stale: false, updatedAt: bus.fetchedAt } }) as never);
}
afterEach(() => vi.restoreAllMocks());

it("distinguishes identically named places using their nearby official stops", () => {
  const duplicatePlaces = places.slice(0, 2).map(p => ({ ...p, name: "石排灣" }));
  const routes: BusNetwork["routes"] = [{ routeCode: "56", routeName: "56", direction: 0, circular: false, company: { id: "a", name: "巴士", color: "orange" }, stops: duplicatePlaces.map((p, i) => ({ stationCode: `C${i}`, stationName: `附近站${i}`, coordinates: p.coordinates })) }];
  const choices = placesFor("石排灣", { ...bus, routes }, { ...walking, places: duplicatePlaces });
  expect(choices.map(c => c.nearbyStop)).toEqual(["附近站0 (C0)", "附近站1 (C1)"]);
});

it("uses a known destination alias without normalizing an unused misspelled alias", async () => {
  sources();
  const model = vi.spyOn(assistant, "callAssistantProvider")
    .mockRejectedValue(new Error("unnecessary_normalization"))
    .mockResolvedValueOnce(JSON.stringify({ intent: "journey", destinationQueries: ["媽閣廟", "媽角廟"] }));
  expect((await planAssistantJourney({ question: "去媽角廟", locale: "zh-Hant" })).data).toMatchObject({ kind: "location", destination: { id: "temple" } });
  expect(model).toHaveBeenCalledTimes(1);
});

it("understands a mistyped temple name before asking for location", async () => {
  sources();
  const model = vi.spyOn(assistant, "callAssistantProvider")
    .mockResolvedValueOnce(JSON.stringify({ intent: "journey", destinationQueries: ["媽角廟"] }))
    .mockResolvedValueOnce(JSON.stringify({ corrections: [{ query: "媽角廟", searchQueries: ["媽閣廟"] }] }));
  const { data } = await planAssistantJourney({ question: "我想去媽角廟", locale: "zh-Hant" });
  expect(data).toMatchObject({ kind: "location", destination: { id: "temple", name: "媽閣廟" } });
  expect(model).toHaveBeenCalledTimes(2);
});

it("corrects unresolved itinerary names together and preserves ambiguity and stop order", async () => {
  sources();
  const model = vi.spyOn(assistant, "callAssistantProvider").mockResolvedValue(JSON.stringify({ corrections: [
    { query: "培証", searchQueries: ["澳門培正中學"] }, { query: "媽角", searchQueries: ["媽閣"] },
  ] }));
  const { data } = await planAssistantJourney({ question: "由培証去媽角再返培正", locale: "zh-Hant", trip: {
    mode: "ordered", originQuery: "培証", stops: [{ query: "媽角" }, { query: "澳門培正中學" }],
  } });
  expect(data.kind).toBe("trip-choice");
  if (data.kind !== "trip-choice") return;
  expect(data.field).toBe(0);
  expect(data.choices.map(p => p.id)).toEqual(["station", "temple"]);
  expect(data.draft.originId).toBe("school");
  expect(data.draft.stops.map(s => s.query)).toEqual(["媽角", "澳門培正中學"]);
  expect(model).toHaveBeenCalledTimes(1);
  expect(JSON.parse(model.mock.calls[0][0][1].content).queries).toEqual(["培証", "媽角"]);
});

it("does not create a destination from a model name absent from the catalogue", async () => {
  sources();
  vi.spyOn(assistant, "callAssistantProvider")
    .mockResolvedValueOnce(JSON.stringify({ intent: "journey", destinationQueries: ["不明地名"] }))
    .mockResolvedValueOnce(JSON.stringify({ corrections: [{ query: "不明地名", searchQueries: ["虛構景點"] }] }));
  expect((await planAssistantJourney({ question: "我想去不明地名", locale: "zh-Hant" })).data.kind).toBe("clarify");
});

it("rejects corrections for a different field instead of applying them to the trip", async () => {
  sources();
  vi.spyOn(assistant, "callAssistantProvider")
    .mockResolvedValueOnce(JSON.stringify({ intent: "journey", destinationQueries: ["媽角廟"] }))
    .mockResolvedValueOnce(JSON.stringify({ corrections: [{ query: "另一地點", searchQueries: ["澳門培正中學"] }] }));
  await expect(planAssistantJourney({ question: "去媽角廟", locale: "zh-Hant" })).rejects.toThrow();
});
