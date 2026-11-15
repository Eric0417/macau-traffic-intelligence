import { afterEach, expect, it, vi } from "vitest";
import type { AssistantJourneyRequest } from "@/lib/assistant-journey";
import type { BusNetwork } from "@/lib/bus-journey";
import { assistantJourneyRequestSchema } from "@/lib/contracts";
import type { JourneyPlace, WalkingNetwork } from "@/lib/walking-network";
import * as cache from "@/server/cache";
import * as assistant from "@/server/sources/assistant";
import { planAssistantJourney } from "@/server/sources/assistant-journeys";
import { walkingNetworkSource } from "@/server/sources/walking-network";

const origin: [number, number] = [113.55, 22.19];
const closer: [number, number] = [113.5508, 22.19];
const farther: [number, number] = [113.552, 22.19];
const dated = "2026-11-09T21:22:17Z";
const places: JourneyPlace[] = [
  { id: "school", name: "培正中學", coordinates: origin, context: "", aliases: ["Pui Ching"] },
  { id: "road", name: "醫院後街", coordinates: origin, context: "", aliases: [], street: true },
  { id: "parking", name: "醫院停車場", coordinates: origin, context: "", aliases: [] },
  { id: "bus-stop", name: "醫院巴士站", coordinates: origin, context: "", aliases: [] },
  { id: "hospital-b", name: "第二醫院", coordinates: farther, context: "", aliases: [], facilityCategory: "hospital" },
  { id: "hospital-a", name: "第一醫院", coordinates: closer, context: "", aliases: [], facilityCategory: "hospital" },
  { id: "clinic", name: "市區診所", coordinates: farther, context: "", aliases: [], facilityCategory: "clinic" },
  { id: "pharmacy", name: "市區藥房", coordinates: closer, context: "", aliases: [], facilityCategory: "pharmacy" },
  { id: "toilet", name: "公園公廁", coordinates: closer, context: "", aliases: [], facilityCategory: "toilets" },
];
const walking: WalkingNetwork = { mappedAt: dated, places, nodes: [origin, closer, farther], edges: [[0, 1, 0, true], [1, 2, 0, true]] };
const bus: BusNetwork = {
  fetchedAt: dated, coverage: { catalogRoutes: 1, loadedRoutes: 1, missingRoutes: [] },
  routes: [{ routeCode: "00003", routeName: "3", direction: 0, circular: false, company: { id: "a", name: "澳巴", color: "orange" }, stops: [
    { stationCode: "M1", stationName: "出發站", coordinates: origin },
    { stationCode: "M2", stationName: "醫院站", coordinates: closer },
  ] }],
};
function sourceFixtures(map = walking, buses: BusNetwork | null = bus) {
  return vi.spyOn(cache, "readSource").mockImplementation(async source => {
    const data = source.id === "walking-network" ? map : source.id === "bus-network" ? buses : [];
    return data ? { result: { data, updatedAt: dated, stale: false } } as never : null;
  });
}
function modelIntent(intent: object) {
  return vi.spyOn(assistant, "callAssistantProvider").mockResolvedValueOnce(JSON.stringify(intent));
}
async function send(request: AssistantJourneyRequest) {
  return (await planAssistantJourney(request)).data;
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it("classifies first, requests location, then continues with the nearest tagged hospital and real connections", async () => {
  const read = sourceFixtures();
  const search = { category: "hospital", action: "directions" } as const;
  const model = modelIntent({ intent: "facility", facilitySearch: search });
  model.mockImplementationOnce(async messages => {
    const evidence = JSON.parse(messages[1].content);
    expect(evidence.origin.coordinates).toEqual(origin);
    expect(evidence.destination.id).toBe("hospital-a");
    expect(evidence.candidates.some((candidate: { mode: string }) => candidate.mode === "walk")).toBe(true);
    return JSON.stringify({ summary: "去第一醫院", options: evidence.candidates.slice(0, 2).map((candidate: { id: string }) => ({ id: candidate.id, title: "建議路線", reason: "按路線資料" })) });
  });
  const question = "我想要最近嘅醫院";
  const first = await send({ question, locale: "zh-Hant" });
  expect(first).toEqual({ kind: "facility-location", search });
  expect(read).not.toHaveBeenCalled();
  expect(JSON.parse(model.mock.calls[0][0][1].content)).toMatchObject({ question });
  expect(JSON.parse(model.mock.calls[0][0][1].content)).not.toHaveProperty("origin");

  const routed = await send({ question, locale: "zh-Hant", origin, facilitySearch: search });
  expect(routed).toMatchObject({
    kind: "plans", origin: { id: "current" }, destination: { id: "hospital-a" },
    facilityMatch: { search, distanceMeters: expect.any(Number) },
  });
  expect(model).toHaveBeenCalledTimes(2);
  expect(read.mock.calls.some(([source]) => source.id.startsWith("bus-diversion-"))).toBe(true);
});

it.each([
  ["最近邊間醫院", "zh-Hant", "hospital", "hospital-a"],
  ["请帮我找离我最近的药店", "zh-Hans", "pharmacy", "pharmacy"],
  ["Any clinics around here?", "en", "clinic", "clinic"],
  ["附近邊度有廁所唔該", "zh-Hant", "toilets", "toilet"],
] as const)("returns a typed result for %s with the specified locale", async (question, locale, category, id) => {
  const read = sourceFixtures();
  const model = modelIntent({ intent: "facility", facilitySearch: { category, action: "nearest" } });
  expect(await send({ question, locale, origin })).toMatchObject({ kind: "facilities", matches: [{ id }] });
  expect(read.mock.calls.map(([source]) => source.id)).toEqual(["walking-network"]);
  expect(model).toHaveBeenCalledOnce();
});

it("uses a named landmark instead of device coordinates, and orders several hospitals by distance", async () => {
  sourceFixtures();
  modelIntent({ intent: "facility", originQuery: "Pui Ching", facilitySearch: { category: "hospital", action: "list" } });
  expect(await send({ question: "Any hospitals near Pui Ching?", locale: "en", origin: farther })).toMatchObject({
    kind: "facilities", origin: { id: "school" }, matches: [{ id: "hospital-a" }, { id: "hospital-b" }],
  });
});

it("carries a category through origin choice and accepts the corrected origin without reclassification", async () => {
  sourceFixtures({ ...walking, places: [...places, { ...places[0], id: "other-school", coordinates: farther }] });
  const search = { category: "pharmacy", action: "nearest" } as const;
  const model = modelIntent({ intent: "facility", originQuery: "培正中學", facilitySearch: search });
  const question = "培正附近邊度有藥房？";
  expect(await send({ question, locale: "zh-Hant" })).toMatchObject({ kind: "choose", field: "origin", facilitySearch: search });
  expect(await send({ question, locale: "zh-Hant", facilitySearch: search, originId: "school" })).toMatchObject({ kind: "facilities", origin: { id: "school" }, matches: [{ id: "pharmacy" }] });
  expect(model).toHaveBeenCalledOnce();
});

it("ranks by a connected walking path when the nearest by air is disconnected", async () => {
  const detached: [number, number] = [113.5508, 22.1903];
  sourceFixtures({
    ...walking,
    places: places.map(place => place.id === "hospital-a" ? { ...place, coordinates: detached } : place),
    nodes: [origin, [113.55, 22.1895], [113.552, 22.1895], farther, detached, [113.5509, 22.1903]],
    edges: [[0, 1, 0, true], [1, 2, 0, true], [2, 3, 0, true], [4, 5, 0, true]],
  });
  const search = { category: "hospital", action: "nearest", distance: "walking" } as const;
  modelIntent({ intent: "facility", facilitySearch: search });
  expect(await send({ question: "由我呢度行去邊間醫院最近？", locale: "zh-Hant", origin })).toMatchObject({
    kind: "facilities", search, matches: [{ id: "hospital-b", distanceMeters: expect.any(Number) }],
  });
});

it("keeps a located hospital when the bus topology is temporarily unavailable", async () => {
  sourceFixtures(walking, null);
  modelIntent({ intent: "facility", facilitySearch: { category: "hospital", action: "directions" } });
  expect(await send({ question: "帶我去最近嘅醫院", locale: "zh-Hant", origin })).toMatchObject({
    kind: "facilities", matches: [{ id: "hospital-a" }], routeNote: expect.stringContaining("路線"),
  });
});

it("does not assume a map-tagged pharmacy is open or automatically route to it", async () => {
  const read = sourceFixtures();
  const search = { category: "pharmacy", action: "directions", verify: "hours" } as const;
  const model = modelIntent({ intent: "facility", facilitySearch: { category: "pharmacy", action: "directions" } });
  expect(await send({ question: "帶我去而家仲開緊嘅藥房", locale: "zh-Hant", origin })).toMatchObject({
    kind: "facilities", search, matches: [{ id: "pharmacy" }],
  });
  expect(read.mock.calls.map(([source]) => source.id)).toEqual(["walking-network"]);
  expect(model).toHaveBeenCalledOnce();
});

it("asks for a Macau landmark when the provided device location is outside the search area", async () => {
  const read = sourceFixtures();
  const search = { category: "clinic", action: "nearest" } as const;
  modelIntent({ intent: "facility", facilitySearch: search });
  expect(await send({ question: "最近的诊所", locale: "zh-Hans", origin: [114.17, 22.32] })).toEqual({
    kind: "facility-location", search, reason: "outside-macau",
  });
  expect(read).not.toHaveBeenCalled();
});

it("shows emergency contact before requesting location or planning transport", async () => {
  const read = sourceFixtures();
  modelIntent({ intent: "emergency" });
  expect(await send({ question: "我要叫白車", locale: "zh-Hant" })).toEqual({ kind: "emergency" });
  expect(read).not.toHaveBeenCalled();
});

it("rejects unknown categories at the request boundary", () => {
  expect(assistantJourneyRequestSchema.safeParse({
    question: "Nearest shop", facilitySearch: { category: "invented", action: "directions" },
  }).success).toBe(false);
});

it("imports real facility categories without marking hospital streets or parking as hospitals", async () => {
  const snapshot = await walkingNetworkSource.load();
  for (const [id, category] of [["a481867710", "hospital"], ["n2950694038", "clinic"], ["n5255643437", "toilets"]]) {
    expect(snapshot.places.find(place => place.id === id)?.facilityCategory).toBe(category);
  }
  for (const id of ["w307035308", "n11889165037", "n10132281747", "n4443180914"]) {
    expect(snapshot.places.find(place => place.id === id)?.facilityCategory).toBeUndefined();
  }
  expect(snapshot.places.some(place => place.facilityCategory === "pharmacy")).toBe(true);
});


it("keeps the matched facility when route ranking returns an invalid option", async () => {
  sourceFixtures();
  const model = modelIntent({ intent: "facility", facilitySearch: { category: "hospital", action: "directions" } });
  model.mockResolvedValueOnce(JSON.stringify({
    summary: "Invented", options: [{ id: "invalid-id", title: "Invented", reason: "Invented" }],
  }));
  expect(await send({ question: "Go to the closest hospital", locale: "en", origin })).toMatchObject({
    kind: "facilities", matches: [{ id: "hospital-a" }], routeNote: expect.stringContaining("could not be confirmed"),
  });
});


it("uses a named square's reference point instead of asking about street fragments", async () => {
  const realMap = await walkingNetworkSource.load();
  sourceFixtures(realMap, null);
  modelIntent({ intent: "facility", originQuery: "關閘廣場", facilitySearch: { category: "clinic", action: "nearest" } });
  expect(await send({ question: "有没有离关闸广场近一点的卫生中心？", locale: "zh-Hans" })).toMatchObject({
    kind: "facilities", origin: { id: "n6353597986", name: "關閘廣場" }, matches: [{ id: expect.any(String) }],
  });
});
