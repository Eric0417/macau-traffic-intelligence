import "server-only";
import { z } from "zod";
import snapshot from "../../../data/bus-network.json";
import type { BusJourneyRoute, BusNetwork } from "@/lib/bus-journey";
import type { BusRoute } from "@/lib/types";
import { createDsatToken } from "@/server/dsat-token";
import { fetchJson } from "@/server/http";
import type { SourceDefinition } from "@/server/source";

const coordinatesSchema = z.tuple([z.number().min(113.4).max(113.7), z.number().min(22).max(22.3)]);
const stopSchema = z.object({ stationCode: z.string().min(1), stationName: z.string().min(1), coordinates: coordinatesSchema });
export const busNetworkSchema = z.object({
  fetchedAt: z.iso.datetime(),
  routes: z.array(z.object({
    routeCode: z.string().min(1), routeName: z.string().min(1), direction: z.union([z.literal(0), z.literal(1)]),
    circular: z.boolean(), company: z.object({ id: z.string(), name: z.string(), color: z.enum(["blue", "orange"]) }),
    stops: z.array(stopSchema).min(2),
  })).min(1),
  coverage: z.object({ catalogRoutes: z.number().int().positive(), loadedRoutes: z.number().int().nonnegative(), missingRoutes: z.array(z.string()) }),
});

const locationSchema = z.object({
  header: z.literal("000"),
  data: z.object({ stationInfoList: z.array(z.object({
    stationCode: z.string().trim().min(1), stationName: z.string().trim().min(1),
    longitude: z.string().min(1), latitude: z.string().min(1),
  })).min(2) }),
});

export function parseBusNetworkRoute(payload: unknown, route: BusRoute, direction: 0 | 1): BusJourneyRoute {
  const response = locationSchema.parse(payload);
  return {
    routeCode: route.routeCode, routeName: route.routeName, direction,
    circular: route.routeType === 2, company: route.company,
    stops: response.data.stationInfoList.map((stop) => stopSchema.parse({
      stationCode: stop.stationCode.toUpperCase(), stationName: stop.stationName,
      coordinates: [Number(stop.longitude), Number(stop.latitude)],
    })),
  };
}

async function loadDirection(route: BusRoute, direction: 0 | 1): Promise<BusJourneyRoute> {
  const data = { lang: "zh_tw", device: "web", routeCode: route.routeCode, dir: String(direction) };
  const payload = await fetchJson("https://bis.dsat.gov.mo:37812/macauweb/routestation/location", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", token: createDsatToken(data) },
    body: new URLSearchParams(data).toString(), timeoutMs: 8_000,
  });
  return parseBusNetworkRoute(payload, route, direction);
}

/** Explicit build operation; ordinary source reads serve the dated snapshot. */
export async function collectBusNetwork(catalog: BusRoute[]): Promise<BusNetwork> {
  if (!catalog.length) throw new Error("No verified bus catalog");
  const jobs = catalog.filter((route) => route.live).flatMap((route) =>
    (route.routeType === 2 ? [0 as const] : [0 as const, 1 as const]).map((direction) => ({ route, direction })),
  );
  const missing = new Set(catalog.filter((route) => !route.live).map((route) => route.routeName));
  const routes: BusJourneyRoute[] = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const { route, direction } = jobs[cursor++];
      try { routes.push(await loadDirection(route, direction)); }
      catch { missing.add(route.routeName); }
    }
  }));
  routes.sort((a, b) => a.routeName.localeCompare(b.routeName, "en", { numeric: true }) || a.direction - b.direction);
  return busNetworkSchema.parse({
    fetchedAt: new Date().toISOString(), routes,
    coverage: { catalogRoutes: catalog.length, loadedRoutes: catalog.filter((route) => !missing.has(route.routeName)).length, missingRoutes: [...missing].sort() },
  });
}

export const busNetworkSource: SourceDefinition<BusNetwork> = {
  id: "bus-network", name: "DSAT 巴士站序資料快照",
  url: "https://bis.dsat.gov.mo:37812/macauweb/",
  attribution: "交通事務局官方路線及站序；日期見 fetchedAt，並非目前營運或班次保證",
  envKey: "SOURCE_BUS_ENABLED", ttlSeconds: 21_600, staleTtlSeconds: 2_592_000,
  schema: busNetworkSchema, load: async () => busNetworkSchema.parse(snapshot),
};
