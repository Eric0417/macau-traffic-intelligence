import "server-only";
import { z } from "zod";
import { roadCollectionSchema } from "@/lib/contracts";
import type { LocalizedText, RoadCollection, TrafficStatus } from "@/lib/types";
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
