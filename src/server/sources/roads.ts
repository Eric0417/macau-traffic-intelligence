import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { roadCollectionSchema } from "@/lib/contracts";
import type { LocalizedText, RoadCollection, TrafficStatus } from "@/lib/types";
import { distanceMeters } from "@/lib/resident-tools";
import { readSource } from "@/server/cache";
import { createDsatToken } from "@/server/dsat-token";
import { fetchJson } from "@/server/http";
import type { SourceDefinition } from "@/server/source";

const rawRoadSchema = z.object({
  reid: z.string(),
  twName: z.string().nullish().transform((value) => value ?? ""),
  cnName: z.string().nullish().transform((value) => value ?? ""),
  ptName: z.string().nullish().transform((value) => value ?? ""),
  enName: z.string().nullish().transform((value) => value ?? ""),
  trafficLevel: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(-1)]),
  coordinate: z.string(),
  length: z.coerce.number().nonnegative(),
  isShowName: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((value) => value ?? "0"),
});

const responseSchema = z.object({
  success: z.boolean(),
  data: z.array(rawRoadSchema),
});

function statusFromLevel(level: 1 | 2 | 3 | -1): TrafficStatus {
  if (level === 1) return "normal";
  if (level === 2) return "slow";
  if (level === 3) return "congested";
  return "unknown";
}

function names(road: z.infer<typeof rawRoadSchema>): LocalizedText {
  return {
    "zh-Hant": road.twName,
    "zh-Hans": road.cnName,
    pt: road.ptName || undefined,
    en: road.enName || road.twName,
  };
}

function parseCoordinates(value: string): Array<[number, number]> {
  return value
    .split(";")
    .map((pair) => pair.split(",").map(Number))
    .filter(
      (pair): pair is [number, number] =>
        pair.length === 2 &&
        Number.isFinite(pair[0]) &&
        Number.isFinite(pair[1]) &&
        pair[0] > 113 &&
        pair[0] < 114 &&
        pair[1] > 22 &&
        pair[1] < 23,
    );
}

export async function loadRoads(): Promise<RoadCollection> {
  const response = responseSchema.parse(
    await fetchJson("https://bis.dsat.gov.mo/api/Service/RoadTrafficSimpleGraph_Road"),
  );

  return roadCollectionSchema.parse({
    type: "FeatureCollection",
    features: response.data.flatMap((road) => {
      const coordinates = parseCoordinates(road.coordinate);
      if (coordinates.length < 2) return [];

      return [
        {
          type: "Feature" as const,
          properties: {
            id: road.reid,
            name: names(road),
            nameVisible: String(road.isShowName ?? "0") === "1",
            lengthMeters: road.length,
            status: statusFromLevel(road.trafficLevel),
            officialLevel: road.trafficLevel,
          },
          geometry: {
            type: "LineString" as const,
            coordinates,
          },
        },
      ];
    }),
  });
}

export const roadsSource: SourceDefinition<RoadCollection> = {
  id: "roads",
  name: "DSAT 即時道路擁塞",
  url: "https://bis.dsat.gov.mo/trafficmap/",
  attribution: "交通事務局及地圖繪製暨地籍局發佈的道路路況",
  envKey: "SOURCE_ROADS_ENABLED",
  ttlSeconds: 60,
  staleTtlSeconds: 900,
  schema: roadCollectionSchema,
  load: loadRoads,
};

const dsatTrafficPage = "https://bis.dsat.gov.mo/macauTraffic/?lang=zh_tw";
const dsatRoadPath = "https://bis.dsat.gov.mo/ddbus/common/supermap/road/";
const geometrySchema = z.array(z.object({ roadSectionId: z.string().min(1), roadCoordinates: z.string() })).min(1);
const predictionSchema = z.array(z.object({
  roadSectionId: z.string().min(1), indexType: z.literal("03"), type: z.literal("road"),
  newTrafficLevel: z.enum(["-1", "1", "2", "3"]),
})).min(1);

async function fetchRoadProduct<T>(path: string, schema: z.ZodType<T>, forecast = false): Promise<T> {
  const payload = { ...(forecast ? { indexType: "03" } : {}), device: "web", HUID: randomUUID() };
  return z.object({ header: z.object({ status: z.literal("000") }), data: schema }).parse(await fetchJson(dsatRoadPath + path, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", token: createDsatToken(payload), Referer: dsatTrafficPage },
    body: new URLSearchParams(payload).toString(),
  })).data;
}

const forecastGeometry: SourceDefinition<z.infer<typeof geometrySchema>> = {
  id: "road-forecast-geometry", name: "DSAT 交通態勢路網", url: dsatTrafficPage, attribution: "交通事務局",
  envKey: "SOURCE_ROADS_ENABLED", ttlSeconds: 21_600, staleTtlSeconds: 86_400,
  schema: geometrySchema, load: () => fetchRoadProduct("coordinates", geometrySchema),
};

export async function loadRoadForecast(): Promise<RoadCollection> {
  const [geometry, statuses] = await Promise.all([
    readSource(forecastGeometry),
    fetchRoadProduct("traffic/situation", predictionSchema, true),
  ]);
  if (!geometry) throw new Error("road_forecast_geometry_unavailable");
  if (geometry.refresh) await geometry.refresh();
  const levels = new Map(statuses.map(row => [row.roadSectionId, Number(row.newTrafficLevel) as 1 | 2 | 3 | -1]));
  if (levels.size !== statuses.length) throw new Error("duplicate_road_forecast_status");
  const features: RoadCollection["features"] = geometry.result.data.flatMap(row => {
    const coordinates = parseCoordinates(row.roadCoordinates);
    if (coordinates.length < 2) return [];
    const level = levels.get(row.roadSectionId) ?? -1;
    const lengthMeters = coordinates.slice(1).reduce((total, p, index) => total + distanceMeters(coordinates[index], p), 0);
    return [{
      type: "Feature", properties: { id: row.roadSectionId, name: { "zh-Hant": "", "zh-Hans": "", en: "" },
        nameVisible: false, lengthMeters, status: statusFromLevel(level), officialLevel: level },
      geometry: { type: "LineString", coordinates },
    }];
  });
  if (new Set(features.map(feature => feature.properties.id)).size !== features.length) throw new Error("duplicate_road_forecast_geometry");
  if (!features.some(feature => levels.has(feature.properties.id))) throw new Error("road_forecast_no_matching_sections");
  return { type: "FeatureCollection", features };
}

export const roadForecastSource: SourceDefinition<RoadCollection> = {
  id: "road-forecast",
  name: "DSAT 30 分鐘道路預測",
  url: dsatTrafficPage,
  attribution: "交通事務局交通態勢的約 30 分鐘後預測",
  envKey: "SOURCE_ROADS_ENABLED", ttlSeconds: 60, staleTtlSeconds: 900,
  schema: roadCollectionSchema, load: loadRoadForecast,
};
