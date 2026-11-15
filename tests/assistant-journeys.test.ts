import { afterEach, expect, it, vi } from "vitest";
import * as assistant from "@/server/sources/assistant";
import * as cache from "@/server/cache";
import { planAssistantJourney } from "@/server/sources/assistant-journeys";
import type { BusNetwork } from "@/lib/bus-journey";
import type { WalkingNetwork } from "@/lib/walking-network";
import { journeyCandidates } from "@/server/sources/journey-candidates";
import { after } from "next/server";

vi.mock("next/server", () => ({ after: vi.fn() }));

const from = { stationCode: "M1", stationName: "起點站", coordinates: [113.55, 22.19] as [number, number] };
const to = { stationCode: "M2", stationName: "目的地站", coordinates: [113.56, 22.19] as [number, number] };
const network: BusNetwork = { fetchedAt: "2026-11-10T00:00:00.000Z", coverage: { catalogRoutes: 2, loadedRoutes: 2, missingRoutes: [] }, routes: ["3", "8"].map(routeName => ({ routeCode: routeName, routeName, direction: 0, circular: false, company: { id: "a", name: "澳巴", color: "orange" }, stops: [from, to] })) };
const walking: WalkingNetwork = { mappedAt: network.fetchedAt, places: [{ id: "arena", name: "澳門體育館", aliases: [], context: "", coordinates: to.coordinates }], nodes: [from.coordinates, to.coordinates], edges: [[0, 1, 0, true]] };
function sources(suspended: string[] = []) {
  vi.spyOn(cache, "readSource").mockImplementation(async source => ({ result: { data: source.id === "bus-network" ? network : source.id === "walking-network" ? walking : suspended, stale: false, updatedAt: network.fetchedAt, ttlSeconds: 60, attribution: { id: source.id, name: source.name, url: source.url, text: source.attribution } } }) as never);
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("routes an extracted destination to planning even when labelled as traffic", async () => {
  sources();
  vi.spyOn(assistant, "callAssistantProvider").mockResolvedValue(JSON.stringify({ intent: "traffic", destinationQueries: ["澳門體育館"] }));
  expect((await planAssistantJourney({ question: "澳門體育館有咩巴士去？", locale: "zh-Hant" })).data.kind).toBe("location");
});

it("finds another bus after the first six route options have suspended stops", async () => {
  const buses = { ...network, routes: Array.from({ length: 7 }, (_, i) => ({ ...network.routes[0], routeName: String(i + 1), routeCode: String(i + 1) })) };
  vi.spyOn(cache, "readSource").mockImplementation(async source => ({ result: { data: source.id === "bus-diversion-7" ? [] : ["M1"], stale: false } }) as never);
  const evidence = await journeyCandidates(buses, walking, { id: "start", name: "起點", coordinates: from.coordinates }, walking.places[0], "zh-Hant", 600);
  expect(evidence.candidates.some(c => c.legs[0]?.routeName === "7")).toBe(true);
});

it("finds daytime buses to Seac Pai Van from the checked-in Macau place and route snapshots", async () => {
  const { busNetworkSource } = await import("@/server/sources/bus-network");
  const snapshot = (await import("../data/walking-network.json")).default as unknown as WalkingNetwork;
  const buses = await busNetworkSource.load();
  const origin = snapshot.places.find(p => p.id === "a530867064")!;
  const destination = snapshot.places.find(p => p.id === "n2805421749")!;
  const evidence = await journeyCandidates(buses, snapshot, origin, destination, "zh-Hant", 720, undefined, false);
  expect(evidence.candidates.some(c => c.legs.length === 1 && c.legs[0].routeName === "56")).toBe(true);
  expect(evidence.candidates.some(c => c.legs.some(l => l.routeName.startsWith("N")))).toBe(false);
});

it("finds buses to the Panda Pavilion entrance from the reported Pui Ching location", async () => {
  const { busNetworkSource } = await import("@/server/sources/bus-network");
  const snapshot = (await import("../data/walking-network.json")).default as unknown as WalkingNetwork;
  const buses = await busNetworkSource.load();
  const origin = { id: "current", name: "目前位置", coordinates: [113.5477777257665, 22.20232924839855] as [number, number] };
  const destination = snapshot.places.find(p => p.id === "a458587494")!;
  for (const [start, end] of [[origin, destination], [destination, origin]]) {
    const evidence = await journeyCandidates(buses, snapshot, start, end, "zh-Hant", 743, undefined, false);
    const bus = evidence.candidates.find(c => c.legs.length === 1 && c.legs[0].routeName === "25");
    expect(bus).toBeDefined();
    expect(bus!.accessMeters).toBeLessThanOrEqual(1_000);
    expect(bus!.egressMeters).toBeLessThanOrEqual(1_000);
    expect(bus!.walking?.access).toBeDefined();
    expect(bus!.walking?.egress).toBeDefined();
    expect(evidence.taxiAlternative).toContain("的士");
  }
});

it("offers a separate taxi suggestion for a long walk without inventing a taxi route", async () => {
  const origin = { id: "start", name: "起點", coordinates: from.coordinates };
  const destination = { id: "far", name: "遠處", coordinates: [113.59, 22.19] as [number, number] };
  const empty = { ...network, routes: [] };
  const map = { ...walking, nodes: [from.coordinates, destination.coordinates], edges: [[0, 1, 0, true]] } as WalkingNetwork;
  const evidence = await journeyCandidates(empty, map, origin, destination, "zh-Hant", undefined, undefined, false);
  expect(evidence.taxiAlternative).toContain("由起點乘的士前往遠處");
  expect(evidence.taxiAlternative).toContain("未有即時車輛、行車路線、車費或車程資料");
  expect(evidence.candidates.map(c => c.id)).toEqual(["walk"]);
  expect(evidence.warnings.join(" ")).toContain("唔代表冇巴士服務");
  const short = await journeyCandidates(network, walking, origin, walking.places[0], "zh-Hant", undefined, undefined, false);
  expect(short.taxiAlternative).toBeUndefined();
});

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

it("treats a generic hospital destination returned by the model as a nearby search", async () => {
  sources();
  const model = vi.spyOn(assistant, "callAssistantProvider").mockResolvedValue(JSON.stringify({
    intent: "journey", destinationQueries: ["醫院"],
  }));
  const { data } = await planAssistantJourney({ question: "我想要最近嘅醫院", locale: "zh-Hant" });
  expect(data).toMatchObject({ kind: "facility-location", search: { category: "hospital", action: "directions" } });
  expect(model).toHaveBeenCalledOnce();
  expect(cache.readSource).not.toHaveBeenCalled();
});

it("streams checked candidates before ranking finishes and preserves the final envelope", async () => {
  sources();
  vi.stubEnv("ASSISTANT_API_KEY", "fixture");
  vi.spyOn(cache, "consumeRateLimit").mockResolvedValue({ allowed: true, remaining: 5 });
  let finishRanking: (value: string) => void = () => { throw new Error("Ranking has not started"); };
  let candidateIds: string[] = [];
  vi.spyOn(assistant, "callAssistantProvider").mockImplementation(messages => {
    candidateIds = JSON.parse(messages[1].content).candidates.map((candidate: { id: string }) => candidate.id);
    return new Promise(resolve => { finishRanking = resolve; });
  });
  const { POST } = await import("@/app/api/v1/assistant/journeys/route");
  const response = await POST(new Request("http://localhost/api/v1/assistant/journeys", {
    method: "POST", headers: { Accept: "application/x-ndjson" },
    body: JSON.stringify({ question: "去體育館", locale: "zh-Hant", destinationId: "arena", origin: from.coordinates }),
  }));
  expect(response.headers.get("content-type")).toContain("application/x-ndjson");
  expect(response.headers.get("cache-control")).toContain("no-store");
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let event;
  do { event = JSON.parse(decoder.decode((await reader.read()).value)); } while (event.type !== "candidates");
  expect(event.data.model).toBe("Journey planner");
  expect(event.data.options.length).toBeGreaterThan(0);
  expect(event.data.options.every((option: { journey: { id: string } }) => candidateIds.includes(option.journey.id))).toBe(true);
  finishRanking(JSON.stringify({ summary: "巴士方案", options: candidateIds.slice(0, 2).map(id => ({ id, title: "巴士", reason: "較少轉乘" })) }));
  do { event = JSON.parse(decoder.decode((await reader.read()).value)); } while (event.type !== "complete");
  expect(event.envelope.data.kind).toBe("plans");
  expect(event.envelope.data.options.map((option: { journey: { id: string } }) => option.journey.id)).toEqual(candidateIds.slice(0, 2));
  expect(event.envelope.meta.source.id).toBe("assistant");
  expect((await reader.read()).done).toBe(true);
});

it("ends a failed stream with an explicit error instead of a complete answer", async () => {
  vi.stubEnv("ASSISTANT_API_KEY", "fixture");
  vi.spyOn(cache, "consumeRateLimit").mockResolvedValue({ allowed: true, remaining: 5 });
  vi.spyOn(assistant, "callAssistantProvider").mockResolvedValue("not JSON");
  const { POST } = await import("@/app/api/v1/assistant/journeys/route");
  const response = await POST(new Request("http://localhost/api/v1/assistant/journeys", {
    method: "POST", headers: { Accept: "application/x-ndjson" }, body: JSON.stringify({ question: "去體育館" }),
  }));
  const events = (await response.text()).trim().split("\n").map(line => JSON.parse(line));
  expect(events.at(-1)).toEqual({ type: "error", error: "assistant_unavailable" });
  expect(events.some(event => event.type === "complete")).toBe(false);
});

it("cancels pending ranking and retains scheduled source refreshes after preview use", async () => {
  sources();
  const refresh = vi.fn(async () => {});
  const sourceRead = vi.mocked(cache.readSource).getMockImplementation()!;
  vi.mocked(cache.readSource).mockImplementation(async source => {
    const read = await sourceRead(source);
    return read && { ...read, refresh };
  });
  vi.stubEnv("ASSISTANT_API_KEY", "fixture");
  vi.spyOn(cache, "consumeRateLimit").mockResolvedValue({ allowed: true, remaining: 5 });
  let providerSignal: AbortSignal | undefined;
  const aborted = vi.fn();
  vi.spyOn(assistant, "callAssistantProvider").mockImplementation((_messages, _json, signal) => {
    providerSignal = signal;
    return new Promise((_resolve, reject) => signal!.addEventListener("abort", () => { aborted(); reject(signal!.reason); }, { once: true }));
  });
  const { POST } = await import("@/app/api/v1/assistant/journeys/route");
  const response = await POST(new Request("http://localhost/api/v1/assistant/journeys", {
    method: "POST", headers: { Accept: "application/x-ndjson" },
    body: JSON.stringify({ question: "去體育館", locale: "zh-Hant", destinationId: "arena", origin: from.coordinates }),
  }));
  const reader = response.body!.getReader();
  let event;
  do { event = JSON.parse(new TextDecoder().decode((await reader.read()).value)); } while (event.type !== "candidates");
  expect(after).toHaveBeenCalledWith(refresh);
  expect(vi.mocked(after).mock.calls.filter(([callback]) => callback === refresh)).toHaveLength(1);
  await reader.cancel();
  expect(providerSignal?.aborted).toBe(true);
  expect(aborted).toHaveBeenCalledOnce();
});

it("does not launch a refill diversion round after cancellation during the first source batch", async () => {
  const buses = { ...network, routes: Array.from({ length: 7 }, (_, i) => ({ ...network.routes[0], routeName: String(i + 1), routeCode: String(i + 1) })) };
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  const reads = vi.spyOn(cache, "readSource").mockImplementation(async () => {
    await pending;
    return { result: { data: ["M1"], stale: false } } as never;
  });
  const cancellation = new AbortController();
  const result = journeyCandidates(buses, walking, { id: "start", name: "起點", coordinates: from.coordinates }, walking.places[0], "zh-Hant", 600, undefined, true, cancellation.signal);
  const firstBatchSize = reads.mock.calls.length;
  expect(firstBatchSize).toBeGreaterThan(0);
  cancellation.abort(); release();
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(reads).toHaveBeenCalledTimes(firstBatchSize);
});
