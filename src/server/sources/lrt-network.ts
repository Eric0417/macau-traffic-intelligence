import { z } from "zod";
import networkJson from "../../../data/lrt-network.json";
import type { LrtNetwork } from "@/lib/types";

const localizedSchema = z.object({
  "zh-Hant": z.string(),
  "zh-Hans": z.string(),
  pt: z.string().optional(),
  en: z.string(),
});

export const lrtNetworkSchema = z.object({
  lines: z.object({
    type: z.literal("FeatureCollection"),
    features: z.array(
      z.object({
        type: z.literal("Feature"),
        properties: z.object({
          id: z.string(),
          ref: z.string(),
          name: localizedSchema,
          color: z.string(),
        }),
        geometry: z.object({
          type: z.literal("LineString"),
          coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
        }),
      }),
    ),
  }),
  stations: z.array(
    z.object({
      id: z.string(),
      name: localizedSchema,
      coordinates: z.tuple([z.number(), z.number()]),
      lines: z.array(z.string()),
      interchange: z.boolean(),
    }),
  ),
  timetableEdition: z.string(),
  sourceUpdatedAt: z.string(),
});

export const lrtNetworkFallback: LrtNetwork = lrtNetworkSchema.parse(networkJson);

export const LRT_OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

export function lrtOverpassEndpoints(): string[] {
  const configured = process.env.LRT_OVERPASS_URL?.trim();
  return configured ? [configured] : LRT_OVERPASS_ENDPOINTS;
}

// The official MLM pages publish no machine-readable topology. OpenStreetMap
// route relations provide the line geometry and stop order; the checked-in
// fallback supplies the official names for the stations it already knows.
export const LRT_OVERPASS_QUERY = `[out:json][timeout:45];
(
  relation["route"="light_rail"](22.10,113.52,22.23,113.60);
  node["railway"="stop"](22.10,113.52,22.23,113.60);
);
out body;
>;
out skel qt;`;

export async function fetchOverpassPayload(endpoint: string): Promise<unknown> {
  const response = await fetch(endpoint, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "MacauTrafficIntelligence/0.1",
    },
    body: new URLSearchParams({ data: LRT_OVERPASS_QUERY }).toString(),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`Overpass returned ${response.status}`);
  }
  return response.json();
}

const overpassElementSchema = z.object({
  type: z.enum(["node", "way", "relation"]),
  id: z.number(),
  tags: z.record(z.string(), z.string()).nullish(),
  members: z
    .array(
      z.object({
        type: z.enum(["node", "way", "relation"]),
        ref: z.number(),
        role: z.string().nullish(),
      }),
    )
    .nullish(),
  nodes: z.array(z.number()).nullish(),
  lat: z.number().nullish(),
  lon: z.number().nullish(),
});

const overpassPayloadSchema = z.object({
  elements: z.array(overpassElementSchema),
});

type OverpassElement = z.infer<typeof overpassElementSchema>;
type OverpassRelation = OverpassElement & { type: "relation" };

function isStopMember(member: { type: string; role?: string | null }): boolean {
  return member.type === "node" && (member.role ?? "").startsWith("stop");
}

const SIMPLIFIED: Record<string, string> = {
  碼: "码",
  閣: "阁",
  運: "运",
  場: "场",
  馬: "马",
  會: "会",
  協: "协",
  醫: "医",
  蓮: "莲",
  龍: "龙",
  亞: "亚",
  東: "东",
  機: "机",
  橫: "横",
  灣: "湾",
  線: "线",
  媽: "妈",
  門: "门",
  島: "岛",
  車: "车",
  測: "测",
  試: "试",
};

function simplified(value: string): string {
  return [...value].map((character) => SIMPLIFIED[character] ?? character).join("");
}

function stationKey(name: string): string {
  return name.replace(/站\s*$/u, "").replace(/\s+/gu, "").trim();
}

function distanceMeters(a: [number, number], b: [number, number]): number {
  const latitude = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const east = (a[0] - b[0]) * 111_320 * Math.cos(latitude);
  const north = (a[1] - b[1]) * 110_574;
  return Math.hypot(east, north);
}

function elementKey(element: OverpassElement): string {
  return `${element.type}:${element.id}`;
}

function coordinateOf(element: OverpassElement | undefined): [number, number] | null {
  if (!element || typeof element.lon !== "number" || typeof element.lat !== "number") {
    return null;
  }
  return [element.lon, element.lat];
}

// Member ways are unordered and may run either direction. Join them end to end
// by repeatedly attaching the closest matching endpoint.
function assembleCoordinates(
  relation: OverpassRelation,
  elements: Map<string, OverpassElement>,
): Array<[number, number]> {
  const ways = (relation.members ?? [])
    .filter((member) => member.type === "way")
    .map((member) => elements.get(`way:${member.ref}`))
    .filter((way): way is OverpassElement => Boolean(way?.nodes?.length))
    .map((way) =>
      (way.nodes ?? [])
        .map((nodeId) => elements.get(`node:${nodeId}`))
        .filter((node): node is OverpassElement => Boolean(node)),
    );

  const pending = ways.filter((way) => way.length > 1);
  if (!pending.length) return [];

  const coordinates = pending
    .shift()!
    .map((node) => [node.lon!, node.lat!] as [number, number]);

  while (pending.length) {
    const tail = coordinates.at(-1)!;
    let best: { index: number; reverse: boolean; distance: number } | null = null;

    for (let index = 0; index < pending.length; index += 1) {
      const way = pending[index];
      const first = [way[0].lon!, way[0].lat!] as [number, number];
      const last = [
        way.at(-1)!.lon!,
        way.at(-1)!.lat!,
      ] as [number, number];
      const candidates = [
        { index, reverse: false, distance: Math.hypot(tail[0] - first[0], tail[1] - first[1]) },
        { index, reverse: true, distance: Math.hypot(tail[0] - last[0], tail[1] - last[1]) },
    ];
      const candidate = candidates.sort((a, b) => a.distance - b.distance)[0];
      if (!best || candidate.distance < best.distance) best = candidate;
    }

    if (!best) break;
    const [selected] = pending.splice(best.index, 1);
    const oriented = best.reverse ? selected.toReversed() : selected;
    coordinates.push(
      ...oriented.map((node) => [node.lon!, node.lat!] as [number, number]),
    );
  }

  return coordinates.filter((coordinate, index, all) => {
    if (index === 0) return true;
    const prior = all[index - 1];
    return Math.hypot(coordinate[0] - prior[0], coordinate[1] - prior[1]) > 0.000002;
  });
}

function lineName(tags: Record<string, string>, fallback: LrtNetwork["lines"]["features"][number]["properties"]["name"] | undefined, ref: string) {
  if (fallback) return fallback;
  const zhHant = tags["name:zh"] ?? tags.name ?? ref;
  return {
    "zh-Hant": zhHant,
    "zh-Hans": tags["name:zh-Hans"] ?? tags["name:zh-hans"] ?? simplified(zhHant),
    en: tags["name:en"] ?? zhHant,
    ...(tags["name:pt"] ? { pt: tags["name:pt"] } : {}),
  };
}

function stopName(
  tags: Record<string, string>,
  curated: LrtNetwork["stations"][number] | undefined,
  nodeId: number,
) {
  if (curated) return curated.name;
  const zhHant = tags["name:zh"] ?? tags.name ?? `站 ${nodeId}`;
  return {
    "zh-Hant": zhHant,
    "zh-Hans": tags["name:zh-Hans"] ?? tags["name:zh-hans"] ?? simplified(zhHant),
    en: tags["name:en"] ?? tags.name ?? zhHant,
    ...(tags["name:pt"] ? { pt: tags["name:pt"] } : {}),
  };
}

export function buildLrtNetwork(
  payload: unknown,
  curated: LrtNetwork = lrtNetworkFallback,
): LrtNetwork {
  const { elements } = overpassPayloadSchema.parse(payload);
  // The geometry recursion re-emits nodes without tags. Merge duplicates so
  // the tagged copy from `out body` wins for names.
  const byKey = new Map<string, OverpassElement>();
  for (const element of elements) {
    const key = elementKey(element);
    const existing = byKey.get(key);
    byKey.set(
      key,
      existing
        ? { ...existing, ...element, tags: element.tags ?? existing.tags }
        : element,
    );
  }
  const relations = elements.filter(
    (element): element is OverpassRelation =>
      element.type === "relation" && element.tags?.route === "light_rail",
  );

  const groups = new Map<string, OverpassRelation[]>();
  for (const relation of relations) {
    const ref = relation.tags?.ref?.trim();
    if (!ref) continue;
    const group = groups.get(ref) ?? [];
    group.push(relation);
    groups.set(ref, group);
  }

  const lines: LrtNetwork["lines"]["features"] = [];
  const stations: LrtNetwork["stations"] = [];

  for (const [ref, group] of groups) {
    const stopCount = (relation: OverpassRelation) =>
      (relation.members ?? []).filter(isStopMember).length;
    const relation = [...group].sort(
      (a, b) => stopCount(b) - stopCount(a) || a.id - b.id,
    )[0];
    const stopNodes = (relation.members ?? [])
      .filter(isStopMember)
      .map((member) => byKey.get(`node:${member.ref}`))
      .filter((node): node is OverpassElement => Boolean(node))
      .flatMap((node) => {
        const coordinates = coordinateOf(node);
        return coordinates ? [{ node, coordinates }] : [];
      });
    if (stopNodes.length < 2) continue;

    const coordinates = assembleCoordinates(relation, byKey);
    if (coordinates.length < 2) continue;

    const tags = relation.tags ?? {};
    const curatedLine = curated.lines.features.find(
      (line) => line.properties.ref === ref,
    );
    lines.push({
      type: "Feature",
      properties: {
        id: String(relation.id),
        ref,
        name: lineName(tags, curatedLine?.properties.name, ref),
        color: /^#[0-9a-fA-F]{6}$/.test(tags.colour ?? "")
          ? tags.colour!
          : (curatedLine?.properties.color ?? "#6b7280"),
      },
      geometry: { type: "LineString", coordinates },
    });

    for (const { node, coordinates: stopCoordinates } of stopNodes) {
      const tagsForStop = node.tags ?? {};
      const name = tagsForStop["name:zh"] ?? tagsForStop.name ?? "";
      const key = stationKey(name);
      const existing = key
        ? stations.find(
            (station) =>
              stationKey(station.name["zh-Hant"]) === key &&
              distanceMeters(station.coordinates, stopCoordinates) < 400,
          )
        : undefined;

      if (existing) {
        if (!existing.lines.includes(ref)) existing.lines.push(ref);
        existing.interchange = existing.lines.length > 1;
        continue;
      }

      const curatedStation = key
        ? curated.stations.find(
            (station) =>
              stationKey(station.name["zh-Hant"]) === key &&
              distanceMeters(station.coordinates, stopCoordinates) < 400,
          )
        : undefined;

      stations.push({
        id: curatedStation?.id ?? `osm-${node.id}`,
        name: stopName(tagsForStop, curatedStation, node.id),
        coordinates: stopCoordinates,
        lines: [ref],
        interchange: false,
      });
    }
  }

  return lrtNetworkSchema.parse({
    lines: { type: "FeatureCollection", features: lines },
    stations,
    timetableEdition: curated.timetableEdition,
    sourceUpdatedAt: new Date().toISOString(),
  });
}

// Community data can lose a stop or a whole relation. Keep serving the
// checked-in network when the live result looks incomplete.
export function isUsableLrtNetwork(network: LrtNetwork): boolean {
  if (network.lines.features.length < 3) return false;
  if (network.stations.length < 15) return false;
  if (!network.lines.features.every((line) => line.geometry.coordinates.length >= 2)) {
    return false;
  }
  return network.stations.every(
    (station) => station.name["zh-Hant"].trim().length > 0 && station.lines.length > 0,
  );
}

export async function fetchLrtNetworkFromOverpass(): Promise<LrtNetwork> {
  const errors: string[] = [];
  for (const endpoint of lrtOverpassEndpoints()) {
    try {
      const network = buildLrtNetwork(await fetchOverpassPayload(endpoint), lrtNetworkFallback);
      if (isUsableLrtNetwork(network)) return network;
      errors.push(`${endpoint}: incomplete network`);
    } catch (error) {
      errors.push(`${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`Overpass unavailable (${errors.join("; ")})`);
}
