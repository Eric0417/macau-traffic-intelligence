import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAssistantMessages, buildLearningSnapshot } from "@/server/sources/assistant";
import type { SourceRead } from "@/server/cache";
import type { SourceDefinition } from "@/server/source";
import type { BusEta, BusRoute, RoadCollection } from "@/lib/types";

const readSourceMock = vi.hoisted(() => vi.fn());
vi.mock("@/server/cache", () => ({ readSource: readSourceMock }));

const freshAt = "2026-11-10T10:30:00.000Z";
const staleAt = "2026-11-10T10:29:20.000Z";
const catalog: BusRoute[] = [{
  routeName: "3", routeCode: "00003", routeType: 0,
  company: { id: "orange", name: "澳巴", color: "orange" }, hasChange: false, live: true,
}];
const roads: RoadCollection = { type: "FeatureCollection", features: [] };
const eta = (direction: 0 | 1): BusEta => ({
  routeName: "3", routeCode: "00003", direction, stops: [], vehicles: [],
  routeSegments: [], diversion: { suspendedStops: [] },
});

function sourceRead(source: SourceDefinition<unknown>, data: unknown, stale = false): SourceRead<unknown> {
  return { result: {
    data, attribution: { id: source.id, name: source.name, url: source.url, text: source.attribution },
    updatedAt: stale ? staleAt : freshAt, stale, ttlSeconds: source.ttlSeconds,
  } };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected network request")));
  readSourceMock.mockReset();
  readSourceMock.mockImplementation(async (source: SourceDefinition<unknown>) => {
    if (source.id === "roads") return sourceRead(source, roads);
    if (source.id === "bus-routes") return sourceRead(source, catalog);
    if (source.id === "bus-eta-00003-0") return sourceRead(source, eta(0), true);
    if (source.id === "bus-eta-00003-1") return sourceRead(source, eta(1));
    return null;
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("assistant snapshot freshness", () => {
  it("carries route-direction freshness separately from the fresh catalog and base readings", async () => {
    const { snapshot } = await buildLearningSnapshot("zh-Hant", { question: "3號巴士而家去到邊？" });
    expect(snapshot.bus?.liveRoutes).toHaveLength(2);
    expect(snapshot.bus?.liveRoutes[0]).toMatchObject({ routeCode: "00003", direction: 0 });
    expect(snapshot.sourceStatus).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "roads", updatedAt: freshAt, stale: false }),
      expect.objectContaining({ id: "bus-routes", updatedAt: freshAt, stale: false }),
      expect.objectContaining({ id: "bus-eta-00003-0", updatedAt: staleAt, stale: true }),
      expect.objectContaining({ id: "bus-eta-00003-1", updatedAt: freshAt, stale: false }),
    ]));
    const messages = buildAssistantMessages("3號巴士而家去到邊？", "zh-Hant", snapshot);
    expect(messages[0].content).toContain("bus-eta-{routeCode}-{direction}");
    expect(messages[1].content).toContain(staleAt);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("leaves an unavailable bus direction unloaded instead of assigning it fresh metadata", async () => {
    readSourceMock.mockImplementation(async (source: SourceDefinition<unknown>) => {
      if (source.id === "bus-routes") return sourceRead(source, catalog);
      if (source.id === "bus-eta-00003-0") return sourceRead(source, eta(0), true);
      return null;
    });
    const { snapshot } = await buildLearningSnapshot("zh-Hant", { question: "3號巴士而家去到邊？" });
    expect(snapshot.bus?.liveRoutes.map((route) => route.direction)).toEqual([0]);
    expect(snapshot.sourceStatus).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "bus-eta-00003-1" }),
    ]));
    expect(fetch).not.toHaveBeenCalled();
  });
});
