import { afterEach, expect, it, vi } from "vitest";
import * as assistant from "@/server/sources/assistant";
import * as cache from "@/server/cache";
import { planAssistantJourney } from "@/server/sources/assistant-journeys";
import type { BusNetwork } from "@/lib/bus-journey";
import type { WalkingNetwork } from "@/lib/walking-network";

const from = { stationCode: "M1", stationName: "起點站", coordinates: [113.55, 22.19] as [number, number] };
const to = { stationCode: "M2", stationName: "目的地站", coordinates: [113.56, 22.19] as [number, number] };
const network: BusNetwork = { fetchedAt: "2026-11-10T00:00:00.000Z", coverage: { catalogRoutes: 2, loadedRoutes: 2, missingRoutes: [] }, routes: ["3", "8"].map(routeName => ({ routeCode: routeName, routeName, direction: 0, circular: false, company: { id: "a", name: "澳巴", color: "orange" }, stops: [from, to] })) };
const walking: WalkingNetwork = { mappedAt: network.fetchedAt, places: [{ id: "arena", name: "澳門體育館", aliases: [], context: "", coordinates: to.coordinates }], nodes: [from.coordinates, to.coordinates], edges: [[0, 1, 0, true]] };
function sources(suspended: string[] = []) {
  vi.spyOn(cache, "readSource").mockImplementation(async source => ({ result: { data: source.id === "bus-network" ? network : source.id === "walking-network" ? walking : suspended, stale: false, updatedAt: network.fetchedAt, ttlSeconds: 60, attribution: { id: source.id, name: source.name, url: source.url, text: source.attribution } } }) as never);
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("asks the model to resolve a destination and requests location before planning", async () => {
  sources();
  const model = vi.spyOn(assistant, "callAssistantProvider").mockResolvedValue(JSON.stringify({ intent: "journey", destinationQueries: ["澳門體育館"] }));
  const { data } = await planAssistantJourney({ question: "我想去澳門體育館", locale: "zh-Hant" });
  expect(data).toMatchObject({ kind: "location", destination: { id: "arena" } });
  expect(model).toHaveBeenCalledTimes(1);
});

it("sends coordinates and current Macau time to the model, then returns its ranked real options", async () => {
  sources();
  const model = vi.spyOn(assistant, "callAssistantProvider").mockImplementation(async messages => {
    const context = JSON.parse(messages[1].content);
    expect(context.origin.coordinates).toEqual(from.coordinates);
    expect(context.destination.coordinates).toEqual(to.coordinates);
    expect(context.now).toMatch(/\+08:00$/);
    return JSON.stringify({ summary: "可以乘搭巴士", options: [...context.candidates].reverse().slice(0, 3).map((c: { id: string }) => ({ id: c.id, title: "另一方案", reason: "按步行距離選擇" })) });
  });
  const { data } = await planAssistantJourney({ question: "我想去澳門體育館", locale: "zh-Hant", destinationId: "arena", origin: from.coordinates });
  expect(model).toHaveBeenCalledTimes(1);
  expect(data.kind).toBe("plans");
  if (data.kind === "plans") {
    expect(data.options.length).toBeGreaterThan(1);
    expect(data.options[0].journey.id).toBe("walk");
    expect(data.options[1].journey.legs[0].routeCode).toBe("8");
  }
});

it("rejects invented and duplicate option IDs instead of showing fabricated routes", async () => {
  sources();
  const model = vi.spyOn(assistant, "callAssistantProvider");
  for (const ids of [["invented"], ["3:0:0-1", "3:0:0-1"]]) {
    model.mockResolvedValue(JSON.stringify({ summary: "計劃", options: ids.map(id => ({ id, title: "巴士", reason: "理由" })) }));
    await expect(planAssistantJourney({ question: "去體育館", locale: "zh-Hant", destinationId: "arena", origin: from.coordinates })).rejects.toThrow();
  }
});

it("offers ambiguous destinations without choosing one or requesting location", async () => {
  sources();
  vi.spyOn(assistant, "callAssistantProvider").mockResolvedValue(JSON.stringify({ intent: "journey", destinationQueries: ["站"] }));
  const { data } = await planAssistantJourney({ question: "去個站", locale: "zh-Hant" });
  expect(data.kind).toBe("choose");
});

it("removes suspended boarding and alighting options from the model evidence", async () => {
  sources(["M1"]);
  vi.spyOn(assistant, "callAssistantProvider").mockImplementation(async messages => {
    const context = JSON.parse(messages[1].content);
    expect(context.candidates.every((c: { legs: unknown[] }) => !c.legs.length)).toBe(true);
    return JSON.stringify({ summary: "步行", options: [{ id: "walk", title: "步行", reason: "巴士停站有調整" }] });
  });
  await planAssistantJourney({ question: "去體育館", locale: "zh-Hant", destinationId: "arena", origin: from.coordinates });
});

it("uses provider JSON mode with enough output budget", async () => {
  vi.stubEnv("ASSISTANT_API_KEY", "fixture");
  const fetcher = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: '{"intent":"traffic"}' } }] }));
  vi.stubGlobal("fetch", fetcher);
  await assistant.callAssistantProvider([{ role: "user", content: "return JSON" }], true);
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ response_format: { type: "json_object" }, max_tokens: 1800 });
});

it("returns a no-store response and rejects invalid location input before calling the model", async () => {
  const { POST } = await import("@/app/api/v1/assistant/journeys/route");
  vi.stubEnv("ASSISTANT_API_KEY", "fixture");
  vi.spyOn(cache, "consumeRateLimit").mockResolvedValue({ allowed: true, remaining: 5 });
  const model = vi.spyOn(assistant, "callAssistantProvider");
  const response = await POST(new Request("http://localhost/api/v1/assistant/journeys", { method: "POST", body: JSON.stringify({ question: "去體育館", origin: [999, 999] }) }));
  expect(response.status).toBe(400);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(model).not.toHaveBeenCalled();
});

it("fails visibly when model JSON is malformed", async () => {
  const { POST } = await import("@/app/api/v1/assistant/journeys/route");
  vi.stubEnv("ASSISTANT_API_KEY", "fixture");
  vi.spyOn(cache, "consumeRateLimit").mockResolvedValue({ allowed: true, remaining: 5 });
  vi.spyOn(assistant, "callAssistantProvider").mockResolvedValue("not JSON");
  const response = await POST(new Request("http://localhost/api/v1/assistant/journeys", { method: "POST", body: JSON.stringify({ question: "去體育館" }) }));
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ error: "assistant_unavailable" });
});

it("keeps bus choices for indoor coordinates while labelling unmapped access", async () => {
  const indoorWalking = { ...walking, nodes: [[113.6, 22.2], [113.61, 22.2]], edges: [[0, 1, 0, true]] };
  vi.spyOn(cache, "readSource").mockImplementation(async source => ({ result: { data: source.id === "bus-network" ? network : source.id === "walking-network" ? indoorWalking : [], stale: false, updatedAt: network.fetchedAt } }) as never);
  vi.spyOn(assistant, "callAssistantProvider").mockImplementation(async messages => {
    const context = JSON.parse(messages[1].content);
    expect(context.candidates[0].accessMapped).toBe(false);
    expect(context.warnings.join(" ")).toContain("直線");
    return JSON.stringify({ summary: "巴士方案，步行接駁待核實", options: context.candidates.slice(0, 2).map((c: { id: string }) => ({ id: c.id, title: "巴士", reason: "請核對入口" })) });
  });
  const { data } = await planAssistantJourney({ question: "去體育館", locale: "zh-Hant", destinationId: "arena", origin: from.coordinates });
  expect(data.kind).toBe("plans");
});
