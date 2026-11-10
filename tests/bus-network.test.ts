import { afterEach, describe, expect, it, vi } from "vitest";
import { busNetworkSource, collectBusNetwork, parseBusNetworkRoute } from "@/server/sources/bus-network";
import type { BusRoute } from "@/lib/types";

const route: BusRoute = {
  routeName: "3", routeCode: "00003", routeType: 0,
  company: { id: "orange", name: "澳巴", color: "orange" }, hasChange: false, live: true,
};
// First two entries of the official location response read on 2026-11-10.
const payload = { header: "000", data: { stationInfoList: [
  { latitude: "22.2155020000", longitude: "113.5491800000", stationCode: "M1/9", stationName: "關閘總站", laneName: "D 車道" },
  { latitude: "22.2127590000", longitude: "113.5486200000", stationCode: "M7/1", stationName: "關閘馬路", laneName: "" },
], busInfoList: [{ busPlate: "TEST" }] } };

afterEach(() => vi.unstubAllGlobals());

describe("dated bus network", () => {
  it("serves a dated complete snapshot without making per-user network requests", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected network request")));
    const result = await busNetworkSource.load();
    expect(result.coverage.loadedRoutes).toBe(result.coverage.catalogRoutes);
    expect(result.coverage.missingRoutes).toEqual([]);
    expect(result.routes.length).toBeGreaterThanOrEqual(result.coverage.catalogRoutes);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("normalizes ordered official stops and retains repeated loop occurrences without vehicle payloads", () => {
    const data = { ...payload, data: { ...payload.data, stationInfoList: [...payload.data.stationInfoList, payload.data.stationInfoList[0]] } };
    const result = parseBusNetworkRoute(data, { ...route, routeType: 2 }, 0);
    expect(result.stops.map((stop) => stop.stationCode)).toEqual(["M1/9", "M7/1", "M1/9"]);
    expect(result.stops[0].coordinates).toEqual([113.54918, 22.215502]);
    expect(result.circular).toBe(true);
    expect(result).not.toHaveProperty("busInfoList");
  });

  it("rejects failed, empty or invalid-coordinate directions instead of shortening a journey", () => {
    expect(() => parseBusNetworkRoute({ ...payload, header: "999" }, route, 0)).toThrow();
    expect(() => parseBusNetworkRoute({ header: "000", data: { stationInfoList: [] } }, route, 1)).toThrow();
    const invalid = { ...payload, data: { stationInfoList: [payload.data.stationInfoList[0], { ...payload.data.stationInfoList[1], latitude: "" }] } };
    expect(() => parseBusNetworkRoute(invalid, route, 0)).toThrow();
  });

  it("collects each verified direction with at most four concurrent requests and reports partial routes", async () => {
    const catalog = Array.from({ length: 5 }, (_, index) => ({ ...route, routeName: String(index + 1), routeCode: String(index + 1).padStart(5, "0") }));
    let active = 0;
    let maximum = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const params = new URLSearchParams(String(init.body));
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      return params.get("routeCode") === "00003" && params.get("dir") === "1"
        ? new Response("unavailable", { status: 503 }) : Response.json(payload);
    }));
    const result = await collectBusNetwork(catalog);
    expect(maximum).toBeLessThanOrEqual(4);
    expect(fetch).toHaveBeenCalledTimes(11); // Shared HTTP helper retries the 503 once.
    expect(result.routes).toHaveLength(9);
    expect(result.coverage).toEqual({ catalogRoutes: 5, loadedRoutes: 4, missingRoutes: ["3"] });
    expect(result.routes.some((item) => item.routeCode === "00003" && item.direction === 0)).toBe(true);
  });

  it("does not infer a second direction for circular routes or index unverified seasonal stops", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(payload)));
    const result = await collectBusNetwork([{ ...route, routeType: 2 }, { ...route, routeName: "3AS", routeCode: "003AS", live: false }]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.routes).toHaveLength(1);
    expect(result.coverage.missingRoutes).toEqual(["3AS"]);
  });
});
