import "server-only";
import * as cheerio from "cheerio";
import { z } from "zod";
import { busEtaSchema, busRouteSchema } from "@/lib/contracts";
import type {
  BusCompany,
  BusEtaStop,
  BusRouteSegment,
  BusVehicle,
} from "@/lib/types";
import { createDsatToken } from "@/server/dsat-token";
import { fetchJson, fetchText } from "@/server/http";
import { readSource } from "@/server/cache";
import type { SourceDefinition } from "@/server/source";

const BUS_API = "https://bis.dsat.gov.mo:37812/macauweb";
const DDBUS_API = "https://bis.dsat.gov.mo:37812/ddbus";
const PASSENGER_API = "https://bis.dsat.gov.mo:37812/ddbus/app/passenger/route";
const ROUTE_PAGE = "https://www.dsat.gov.mo/dsat/bus_route.aspx";
const HUID = "cc57da25-d5d8-4286-8712-d98df57c8af6";

// Tile colours on the official route page. bc1 is Transmac, bc2 is TCM.
const COMPANY_BY_TILE: Record<string, BusCompany> = {
  bc1: { id: "blue", name: "新福利", color: "blue" },
  bc2: { id: "orange", name: "澳巴", color: "orange" },
};

const rawRouteSchema = z.object({
  color: z.enum(["Blue", "Orange"]),
  routeChange: z.string(),
  direction: z.string(),
  routeName: z.string(),
});

const routeResponseSchema = z.object({
  header: z.string(),
  data: z.object({
    companyList: z.array(z.object({ color: z.enum(["Blue", "Orange"]), name: z.string() })),
    routeList: z.array(rawRouteSchema),
  }),
});

const etaResponseSchema = z.object({
  header: z.object({ status: z.string() }),
  data: z.object({
    data: z.array(
      z.object({
        msg: z.string(),
        average: z.union([z.string(), z.number()]).nullable().optional(),
        current: z.union([z.string(), z.number()]).nullable().optional(),
        stationCode: z.string(),
        stationName: z.string(),
      }),
    ),
  }),
});

const stationLocationSchema = z.object({
  header: z.string(),
  data: z.object({
    stationInfoList: z
      .array(
        z.object({
          latitude: z.string(),
          longitude: z.string(),
          stationCode: z.string(),
          stationName: z.string(),
          laneName: z.string().nullish().transform((value) => value ?? ""),
        }),
      )
      .nullish()
      .transform((value) => value ?? []),
  }),
});

const routeBusSchema = z.object({
  header: z.string(),
  data: z.object({
    routeInfo: z
      .array(
        z.object({
          staCode: z.string(),
          busInfo: z
            .array(
              z.object({
                busCode: z.string().nullish().transform((value) => value ?? ""),
                busPlate: z.string(),
                busType: z.string().nullish().transform((value) => value ?? ""),
                status: z.string().nullish().transform((value) => value ?? ""),
                isFacilities: z.string().nullish().transform((value) => value ?? "0"),
                speed: z.string().nullish().transform((value) => value ?? ""),
              }),
            )
            .nullish()
            .transform((value) => value ?? []),
        }),
      )
      .nullish()
      .transform((value) => value ?? []),
  }),
});

const routeTrafficSchema = z.object({
  data: z
    .array(
      z.object({
        routeCoordinates: z.string(),
        newRouteTraffic: z.string().nullish().transform((value) => value ?? "-1"),
      }),
    )
    .nullish()
    .transform((value) => value ?? []),
});

const ROUTE_CATEGORY_IDS = "BCAFBD938B8D48B0B3F598B44DD32E6C";

const diversionResponseSchema = z.object({
  header: z.string(),
  data: z
    .object({
      routeChange: z.boolean().nullish().transform((value) => value ?? false),
      suspendBusStop: z
        .array(z.string())
        .nullish()
        .transform((value) => value ?? []),
    })
    .nullish(),
});

function normalizeRouteCode(routeName: string): string {
  return routeName.toUpperCase().padStart(5, "0");
}

function normalizeStationCode(value: string): string {
  return value.trim().toUpperCase();
}

function etaValue(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value.trim().toLowerCase() === "x") return 0;
  if (!/^\d+$/.test(value.trim())) return null;
  return Number(value);
}

function numberOrNull(value: string): number | null {
  const parsed = Number(value);
  return value.trim() !== "" && Number.isFinite(parsed) ? parsed : null;
}

// DSAT uses 1 normal, 2 slow, 3 congested, 4 very congested, -1 unknown.
function statusFromTrafficLevel(level: number): "normal" | "slow" | "congested" | "unknown" {
  if (level === 1) return "normal";
  if (level === 2) return "slow";
  if (level >= 3) return "congested";
  return "unknown";
}

function routeSortKey(routeName: string): [number, string] {
  const match = /^(\d+)(.*)$/.exec(routeName);
  return match ? [Number(match[1]), match[2]] : [Number.POSITIVE_INFINITY, routeName];
}

function compareRoutes(a: { routeName: string }, b: { routeName: string }): number {
  const [aNumber, aSuffix] = routeSortKey(a.routeName);
  const [bNumber, bSuffix] = routeSortKey(b.routeName);
  return aNumber - bNumber || aSuffix.localeCompare(bSuffix);
}

export function parsePublishedRoutes(
  html: string,
): Array<{ routeName: string; company: BusCompany }> {
  const $ = cheerio.load(html);
  const routes = new Map<string, BusCompany>();

  $("a.bus_link").each((_, element) => {
    const href = $(element).attr("href") ?? "";
    const matched = href.match(/route=busroute_([A-Za-z0-9]+)/);
    if (!matched) return;

    const routeName = $(element).find(".bus_route_text").first().text().trim() || matched[1];
    const style = $(element).find("[style*='bc1'], [style*='bc2']").first().attr("style") ?? "";
    const tile = style.includes("bc1") ? "bc1" : style.includes("bc2") ? "bc2" : "";
    const company = COMPANY_BY_TILE[tile];
    if (company) routes.set(routeName, company);
  });

  return [...routes].map(([routeName, company]) => ({ routeName, company }));
}

async function postBusApi<T>(
  url: string,
  data: Record<string, string>,
  schema: z.ZodType<T>,
): Promise<T> {
  const payload = { lang: "zh_tw", device: "web", ...data };

  return schema.parse(
    await fetchJson(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        token: createDsatToken(payload),
      },
      body: new URLSearchParams(payload).toString(),
      timeoutMs: 8_000,
    }),
  );
}

export async function loadBusRoutes() {
  const data = { lang: "zh_tw", device: "web" };

  const response = routeResponseSchema.parse(
    await fetchJson(`${BUS_API}/getRouteAndCompanyList.html`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        token: createDsatToken(data),
      },
      body: new URLSearchParams(data).toString(),
    }),
  );

  if (response.header !== "000") {
    throw new Error(`DSAT route endpoint returned ${response.header}`);
  }

  const companies = new Map(
    response.data.companyList.map((company) => [
      company.color,
      {
        id: company.color.toLowerCase(),
        name: company.name,
        color: company.color === "Blue" ? ("blue" as const) : ("orange" as const),
      },
    ]),
  );

  const tracked = response.data.routeList.map((route) => ({
    routeName: route.routeName,
    routeCode: normalizeRouteCode(route.routeName),
    routeType: route.direction === "2" ? (2 as const) : (0 as const),
    company: companies.get(route.color),
    hasChange: route.routeChange === "1",
    live: true,
  }));

  // The arrival system omits seasonal routes, so the official route page fills the catalog.
  const published = await fetchText(ROUTE_PAGE, { timeoutMs: 8_000 })
    .then(parsePublishedRoutes)
    .catch(() => []);
  const trackedNames = new Set(tracked.map((route) => route.routeName));
  const seasonal = published
    .filter((route) => !trackedNames.has(route.routeName))
    .map((route) => ({
      routeName: route.routeName,
      routeCode: normalizeRouteCode(route.routeName),
      routeType: 0 as const,
      company: route.company,
      hasChange: false,
      live: false,
    }));

  return [...tracked, ...seasonal].sort(compareRoutes).map((route) => busRouteSchema.parse(route));
}

export const busRoutesSource: SourceDefinition<Awaited<ReturnType<typeof loadBusRoutes>>> = {
  id: "bus-routes",
  name: "DSAT 巴士路線",
  url: "https://bis.dsat.gov.mo:37812/macauweb/",
  attribution: "交通事務局巴士報站及巴士路線公開資料",
  envKey: "SOURCE_BUS_ENABLED",
  ttlSeconds: 21_600,
  staleTtlSeconds: 86_400,
  schema: z.array(busRouteSchema),
  load: loadBusRoutes,
};

// The route list flag marks 50 of 97 routes, so a diversion badge only counts when
// the message feed actually reports suspended stops.
function busDiversionSource(routeName: string): SourceDefinition<string[]> {
  return {
    id: `bus-diversion-${routeName}`,
    name: `巴士 ${routeName} 改道`,
    url: `${BUS_API}/`,
    attribution: "交通事務局巴士改道消息",
    envKey: "SOURCE_BUS_ENABLED",
    ttlSeconds: 300,
    staleTtlSeconds: 3_600,
    schema: z.array(z.string()),
    load: async () => {
      const response = await postBusApi(
        `${BUS_API}/getRouteChangeMessage.html`,
        { routeName },
        diversionResponseSchema,
      );

      if (response.header !== "000") {
        throw new Error(`DSAT diversion endpoint returned ${response.header}`);
      }

      return (response.data?.suspendBusStop ?? [])
        .map((entry) => normalizeStationCode(entry.split("$")[0] ?? ""))
        .filter(Boolean);
    },
  };
}

interface EtaStop {
  msg: string;
  average?: string | number | null;
  current?: string | number | null;
  stationCode: string;
  stationName: string;
}

interface StationLocation {
  stationCode: string;
  stationName: string;
  coordinates: [number, number];
}

interface RouteTrafficSegment {
  coordinates: Array<[number, number]> | null;
  trafficLevel: number;
}

async function loadEtaStops(code: string, direction: 0 | 1): Promise<EtaStop[]> {
  const query = new URLSearchParams({
    routeCode: code,
    direction: String(direction),
    lang: "zh_tw",
    device: "web",
    HUID,
  });

  const response = etaResponseSchema.parse(
    await fetchJson(`${PASSENGER_API}?${query}`, { timeoutMs: 8_000 }),
  );

  if (response.header.status !== "000") {
    throw new Error(`DSAT ETA endpoint returned ${response.header.status}`);
  }

  return response.data.data;
}

async function loadStationCoordinates(code: string, direction: 0 | 1) {
  const response = await postBusApi(
    `${BUS_API}/routestation/location`,
    { routeCode: code, dir: String(direction) },
    stationLocationSchema,
  );

  if (response.header !== "000") {
    throw new Error(`DSAT station endpoint returned ${response.header}`);
  }

  return response.data.stationInfoList.map((station) => ({
    stationCode: normalizeStationCode(station.stationCode),
    stationName: station.stationName,
    coordinates: [Number(station.longitude), Number(station.latitude)] as [number, number],
  }));
}

async function loadRouteBuses(
  routeName: string,
  direction: 0 | 1,
  routeType: 0 | 2,
) {
  const response = await postBusApi(
    `${BUS_API}/routestation/bus`,
    {
      action: "dy",
      routeName,
      dir: String(direction),
      routeType: String(routeType),
    },
    routeBusSchema,
  );

  if (response.header !== "000") {
    throw new Error(`DSAT live bus endpoint returned ${response.header}`);
  }

  return response.data.routeInfo;
}

// The official map page draws this polyline; segment i runs from stop i to stop i + 1.
// Keep invalid entries in place so later segments do not shift their stop pairing.
async function loadRouteSegments(code: string, direction: 0 | 1): Promise<RouteTrafficSegment[]> {
  const response = await postBusApi(
    `${DDBUS_API}/common/supermap/route/traffic`,
    {
      routeCode: code,
      direction: String(direction),
      indexType: "00",
      lang: "zh-tw",
      HUID,
      categoryIds: ROUTE_CATEGORY_IDS,
    },
    routeTrafficSchema,
  );

  return response.data.map((segment) => {
    const coordinates = segment.routeCoordinates
      .split(";")
      .map((pair) => pair.split(",").map(Number))
      .filter(
        (pair): pair is [number, number] =>
          pair.length === 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1]),
      );
    const trafficLevel = Number(segment.newRouteTraffic);
    const level = Number.isFinite(trafficLevel) ? trafficLevel : -1;
    return {
      coordinates: coordinates.length >= 2 ? coordinates : null,
      trafficLevel: level,
    };
  });
}

// DSAT only says which stop a bus is approaching, so the vehicle is estimated
// along the official polyline of that stop-to-stop segment.
function pointAlongSegment(
  coordinates: Array<[number, number]>,
  fraction: number,
): { point: [number, number]; bearing: number } | null {
  if (coordinates.length < 2) return null;

  const distances = [0];
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const [x1, y1] = coordinates[index - 1];
    const [x2, y2] = coordinates[index];
    const dx = (x2 - x1) * Math.cos((((y1 + y2) / 2) * Math.PI) / 180);
    const dy = y2 - y1;
    total += Math.hypot(dx, dy);
    distances.push(total);
  }
  if (total === 0) return null;

  const target = total * Math.min(Math.max(fraction, 0), 1);
  for (let index = 1; index < coordinates.length; index += 1) {
    if (distances[index] < target && index < coordinates.length - 1) continue;

    const span = distances[index] - distances[index - 1] || 1;
    const ratio = (target - distances[index - 1]) / span;
    const [x1, y1] = coordinates[index - 1];
    const [x2, y2] = coordinates[index];
    const bearing = ((Math.atan2(x2 - x1, y2 - y1) * 180) / Math.PI + 360) % 360;

    return {
      point: [x1 + (x2 - x1) * ratio, y1 + (y2 - y1) * ratio],
      bearing,
    };
  }

  return null;
}

function mergeStationCodes(
  etaStops: EtaStop[] | null,
  stations: StationLocation[],
  routeBuses: Array<{ staCode: string }>,
): string[] {
  const feeds = [
    (etaStops ?? []).map((stop) => normalizeStationCode(stop.stationCode)),
    stations.map((station) => station.stationCode),
    routeBuses.map((entry) => normalizeStationCode(entry.staCode)),
  ].filter((feed) => feed.length > 0);

  let ordered: string[] = [];
  for (const feed of feeds) {
    if (feed.length > ordered.length) ordered = feed;
  }

  const codes = [...new Set(ordered.filter(Boolean))];
  const seen = new Set(codes);
  for (const feed of feeds) {
    for (const code of feed) {
      if (!code || seen.has(code)) continue;
      seen.add(code);
      codes.push(code);
    }
  }

  return codes;
}

function stopCodeAtCoordinate(
  stops: BusEtaStop[],
  coordinate: [number, number],
): string | null {
  let best: { stationCode: string; distance: number } | null = null;
  for (const stop of stops) {
    if (!stop.coordinates) continue;
    const distance = Math.hypot(
      stop.coordinates[0] - coordinate[0],
      stop.coordinates[1] - coordinate[1],
    );
    if (distance > 0.00002 || (best && best.distance <= distance)) continue;
    best = { stationCode: stop.stationCode, distance };
  }
  return best?.stationCode ?? null;
}

function clampFraction(value: number): number {
  return Math.min(0.95, Math.max(0.05, value));
}

function vehicleFraction(stop: BusEtaStop | undefined, etaMinutes: number | null): number {
  if (!stop || stop.sequence === 0) return 0;
  if (etaMinutes === null) return 0.5;
  return clampFraction(0.9 - Math.min(Math.max(etaMinutes, 0), 20) / 25);
}

export async function loadBusEta(routeCodeValue: string, direction: 0 | 1) {
  const code = routeCodeValue.toUpperCase().padStart(5, "0");
  const routesRead = await readSource(busRoutesSource);
  const route = routesRead?.result.data.find((item) => item.routeCode === code);

  if (!route) {
    throw new Error(`Unknown bus route code ${code}`);
  }

  const [etaStops, stations, routeBuses, routeTrafficSegments, diversion] = await Promise.all([
    loadEtaStops(code, direction).catch(() => null),
    loadStationCoordinates(code, direction).catch(() => []),
    loadRouteBuses(route.routeName, direction, route.routeType).catch(() => []),
    loadRouteSegments(code, direction).catch(() => []),
    readSource(busDiversionSource(route.routeName)),
  ]);

  if (
    !etaStops &&
    stations.length === 0 &&
    routeBuses.length === 0 &&
    routeTrafficSegments.length === 0
  ) {
    throw new Error(`DSAT bus data unavailable for route ${code}`);
  }

  const suspendedCodes = new Set(diversion?.result.data ?? []);
  const etaByCode = new Map(
    (etaStops ?? []).map((stop) => [normalizeStationCode(stop.stationCode), stop]),
  );
  const stationByCode = new Map(stations.map((station) => [station.stationCode, station]));
  const orderedCodes = mergeStationCodes(etaStops, stations, routeBuses);

  const stopsWithoutTraffic: BusEtaStop[] = orderedCodes.map((stationCode, index) => {
    const eta = etaByCode.get(stationCode);
    const station = stationByCode.get(stationCode);
    return {
      sequence: index,
      stationCode,
      stationName: eta?.stationName ?? station?.stationName ?? stationCode,
      etaMinutes: eta ? etaValue(eta.current) : null,
      averageMinutes: eta ? etaValue(eta.average) : null,
      messageCode: eta?.msg ?? "",
      coordinates: station?.coordinates ?? null,
      trafficStatus: "unknown",
      trafficLevel: -1,
      suspended: suspendedCodes.has(stationCode),
    };
  });
  const stopByCode = new Map(stopsWithoutTraffic.map((stop) => [stop.stationCode, stop]));

  const segmentIndexByFromCode = new Map<string, number>();
  const segmentIndexByToCode = new Map<string, number>();
  const routeSegments: BusRouteSegment[] = [];

  routeTrafficSegments.forEach((raw, index) => {
    const first = raw.coordinates?.[0];
    const last = raw.coordinates?.[raw.coordinates.length - 1];
    const fromCode =
      (first ? stopCodeAtCoordinate(stopsWithoutTraffic, first) : null) ??
      stopsWithoutTraffic[index]?.stationCode;
    const toCode =
      (last ? stopCodeAtCoordinate(stopsWithoutTraffic, last) : null) ??
      stopsWithoutTraffic[index + 1]?.stationCode;
    const from = fromCode ? stopByCode.get(fromCode) : undefined;
    const to = toCode ? stopByCode.get(toCode) : undefined;

    if (!raw.coordinates || !from || !to) return;

    const segment: BusRouteSegment = {
      fromStationCode: from.stationCode,
      toStationCode: to.stationCode,
      trafficStatus: statusFromTrafficLevel(raw.trafficLevel),
      trafficLevel: raw.trafficLevel,
      coordinates: raw.coordinates,
    };
    const segmentIndex = routeSegments.length;
    routeSegments.push(segment);
    segmentIndexByFromCode.set(from.stationCode, segmentIndex);
    segmentIndexByToCode.set(to.stationCode, segmentIndex);
  });

  const stopSegmentIndex = new Map<string, number>();
  const stops: BusEtaStop[] = stopsWithoutTraffic.map((stop) => {
    // Traffic on the way to this stop; the first stop shows its departure segment.
    const segmentIndex =
      stop.sequence === 0
        ? segmentIndexByFromCode.get(stop.stationCode)
        : segmentIndexByToCode.get(stop.stationCode);
    if (segmentIndex !== undefined) stopSegmentIndex.set(stop.stationCode, segmentIndex);
    const segment = segmentIndex === undefined ? undefined : routeSegments[segmentIndex];
    const trafficLevel = segment?.trafficLevel ?? -1;
    return {
      ...stop,
      trafficStatus: statusFromTrafficLevel(trafficLevel),
      trafficLevel,
    };
  });

  const suspendedStops = stops
    .filter((stop) => stop.suspended)
    .map((stop) => ({ stationCode: stop.stationCode, stationName: stop.stationName }));

  const pendingVehicles = routeBuses.flatMap((entry) => {
    const stationCode = normalizeStationCode(entry.staCode);
    const stop = stopByCode.get(stationCode);
    return entry.busInfo.map((bus) => ({ bus, stationCode, stop }));
  });
  const pendingByStation = new Map<string, typeof pendingVehicles>();
  for (const pending of pendingVehicles) {
    const group = pendingByStation.get(pending.stationCode);
    if (group) {
      group.push(pending);
    } else {
      pendingByStation.set(pending.stationCode, [pending]);
    }
  }

  const seen = new Set<string>();
  const vehicles: BusVehicle[] = [];
  for (const group of pendingByStation.values()) {
    group.sort((a, b) =>
      (a.bus.busCode || a.bus.busPlate).localeCompare(b.bus.busCode || b.bus.busPlate),
    );

    group.forEach((pending, index) => {
      const { bus, stationCode, stop } = pending;
      const id = bus.busCode || bus.busPlate;
      if (!id || seen.has(id)) return;
      seen.add(id);

      const baseFraction = vehicleFraction(stop, stop?.etaMinutes ?? null);
      const spread = (index - (group.length - 1) / 2) * 0.16;
      const fraction = clampFraction(baseFraction + spread);
      const mappedIndex = stopSegmentIndex.get(stationCode);
      const segment = mappedIndex === undefined ? undefined : routeSegments[mappedIndex];
      const fallback = routeTrafficSegments[stop ? Math.max(0, stop.sequence - 1) : 0];
      const coordinates = segment?.coordinates ?? fallback?.coordinates ?? null;
      const estimate = coordinates ? pointAlongSegment(coordinates, fraction) : null;

      vehicles.push({
        id,
        plate: bus.busPlate,
        busType: bus.busType,
        lowFloor: bus.isFacilities === "1",
        speedKph: numberOrNull(bus.speed),
        status: bus.status,
        stationCode,
        stationName: stop?.stationName ?? stationCode,
        stationSequence: stop?.sequence ?? 0,
        segmentIndex: segment && mappedIndex !== undefined ? mappedIndex : null,
        coordinates: estimate?.point ?? null,
        bearing: estimate?.bearing ?? null,
        estimated: true,
      });
    });
  }

  return busEtaSchema.parse({
    routeName: route.routeName,
    routeCode: route.routeCode,
    direction,
    stops,
    vehicles,
    routeSegments,
    diversion: { suspendedStops },
  });
}
