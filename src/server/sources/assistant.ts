import "server-only";
import { z } from "zod";
import {
  ASSISTANT_DEFAULT_BASE_URL,
  ASSISTANT_DEFAULT_MODEL,
  sourceEnabled,
} from "@/lib/config";
import { busEtaSchema } from "@/lib/contracts";
import type {
  BorderStatus,
  BridgeTime,
  BusEta,
  BusRoute,
  LearningAssistantAnswer,
  LearningAssistantAction,
  Locale,
  LocalizedText,
  LrtNetwork,
  LrtNotice,
  ParkingFacility,
  RoadCollection,
  TrafficNotice,
  WeatherSnapshot,
} from "@/lib/types";
import { readSource, type SourceRead } from "@/server/cache";
import type { SourceDefinition } from "@/server/source";
import { sources } from "@/server/sources";
import { loadBusEta } from "@/server/sources/bus";

export interface AssistantFocus {
  routeCode: string;
  direction: 0 | 1;
}

export interface LearningSnapshot {
  generatedAt: string;
  weather: {
    observedAt: string | null;
    temperatureCelsius: number | null;
    humidityPercent: number | null;
    wind: string | null;
    activeWarnings: string[];
  } | null;
  bridges: Array<{
    name: string;
    direction: "northbound" | "southbound";
    travelMinutes: number;
    status: string;
  }> | null;
  roads: {
    monitoredSegments: number;
    counts: { normal: number; slow: number; congested: number; unknown: number };
    congestedSegments: Array<{ name: string; lengthMeters: number }>;
    slowSegments: Array<{ name: string; lengthMeters: number }>;
    mentionedSegments: Array<{
      name: string;
      segmentCount: number;
      statuses: { normal: number; slow: number; congested: number; unknown: number };
      totalLengthMeters: number;
    }>;
    note: string;
  } | null;
  parking: Array<{
    name: string;
    areaStatus: string;
    lightVehicle: number | null;
  }> | null;
  borders: Array<{
    name: string;
    status: string;
    estimatedWaitMinutes: number | null;
  }> | null;
  notices: Array<{ title: string; category: string; publishedAt: string | null }> | null;
  lrtNotices: Array<{ title: string; active: boolean }> | null;
  bus: {
    catalogAvailable: boolean;
    routeCount: number;
    routeNames: string[];
    matchedRoutes: Array<{
      route: string;
      company: string;
      liveTracking: boolean;
      liveDataLoaded: boolean;
    }>;
    placeCheck: {
      place: string;
      served: boolean;
      direction: 0 | 1 | null;
    } | null;
    liveRoutes: Array<{
      routeName: string;
      direction: 0 | 1;
      liveVehicleCount: number;
      vehicles: Array<{
        plate: string;
        approachingStop: string;
        speedKph: number | null;
        lowFloor: boolean;
      }>;
      nextStops: Array<{
        stationName: string;
        etaMinutes: number | null;
        trafficStatus: string;
      }>;
      stops: string[];
      suspendedStops: string[];
      segmentTraffic: {
        normal: number;
        slow: number;
        congested: number;
        unknown: number;
      };
    }>;
    note: string;
  } | null;
  lrt: {
    edition: string;
    sourceUpdatedAt: string;
    lines: Array<{
      ref: string;
      name: string;
      stationCount: number;
      stations: string[];
    }>;
    stations: Array<{ name: string; lines: string[]; interchange: boolean }>;
    note: string;
  } | null;
}

export interface AssistantAnswerResult {
  answer: LearningAssistantAnswer;
  refreshes: Array<() => Promise<void>>;
}

function pickName(name: LocalizedText, locale: Locale): string {
  return name[locale] || name["zh-Hant"] || name.en;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchNamedRoutes(question: string, routes: BusRoute[]): BusRoute[] {
  if (!question.trim()) return [];
  const haystack = question.toUpperCase();
  const matched: BusRoute[] = [];
  // Longest names first so "3X" wins over "3" and both can still match.
  const sorted = [...routes].sort((a, b) => b.routeName.length - a.routeName.length);
  for (const route of sorted) {
    const name = route.routeName.toUpperCase();
    if (!name) continue;
    const pattern = new RegExp(
      `(?<![A-Z0-9])${escapeRegExp(name)}(?![A-Z0-9])`,
    );
    if (pattern.test(haystack)) {
      matched.push(route);
      if (matched.length >= 2) break;
    }
  }
  return matched;
}

export function looksBusRelated(question: string): boolean {
  return (
    /(巴士|公交|bus|route|路線|路线|班次|站|eta|arrival|departure)/i.test(question) ||
    /(?<![A-Z0-9])[A-Z]{0,3}\d{1,3}[A-Z]?(?![A-Z0-9])/i.test(question)
  );
}

export function extractPlaceQuery(question: string): string | null {
  const zh = question.match(
    /(?:去唔去(?:到)?|去不去(?:到)?|會唔會去|會唔會到|有冇去|到唔到)([^？?！!，,。.；;：:]+)/,
  );
  if (zh?.[1]) return zh[1].trim().slice(0, 12);
  const en = question.match(
    /(?:serve|serves|go(?:es)? to|reach(?:es)?)\s+([^?.,;:!]+)/i,
  );
  if (en?.[1]) {
    return en[1]
      .trim()
      .replace(/^(the|to)\s+/i, "")
      .slice(0, 30);
  }
  return null;
}

export function findMentionedSegments(
  question: string,
  roads: RoadCollection | null,
  locale: Locale,
): NonNullable<LearningSnapshot["roads"]>["mentionedSegments"] {
  if (!roads || !question.trim()) return [];
  const haystack = question.toLowerCase();
  const byName = new Map<
    string,
    NonNullable<LearningSnapshot["roads"]>["mentionedSegments"][number]
  >();

  for (const feature of roads.features) {
    const names = [
      feature.properties.name["zh-Hant"],
      feature.properties.name["zh-Hans"],
      feature.properties.name.en,
    ].filter(Boolean);
    const hit = names.some((name) => {
      const normalized = name.trim().toLowerCase();
      if (!normalized) return false;
      const isCjk = /[\u3400-\u9fff]/.test(name);
      if (isCjk ? normalized.length < 3 : normalized.length < 8) return false;
      return haystack.includes(normalized);
    });
    if (!hit) continue;

    const localized = pickName(feature.properties.name, locale);
    const entry = byName.get(localized) ?? {
      name: localized,
      segmentCount: 0,
      statuses: { normal: 0, slow: 0, congested: 0, unknown: 0 },
      totalLengthMeters: 0,
    };
    entry.segmentCount += 1;
    entry.statuses[feature.properties.status] += 1;
    entry.totalLengthMeters += feature.properties.lengthMeters;
    byName.set(localized, entry);
  }

  return [...byName.values()].slice(0, 5).map((entry) => ({
    ...entry,
    totalLengthMeters: Math.round(entry.totalLengthMeters),
  }));
}

function summariseLrt(
  network: LrtNetwork | null,
  locale: Locale,
): LearningSnapshot["lrt"] {
  if (!network) return null;
  const stationCountByLine = new Map<string, number>();
  const stationsByLine = new Map<string, string[]>();
  for (const station of network.stations) {
    for (const line of station.lines) {
      stationCountByLine.set(line, (stationCountByLine.get(line) ?? 0) + 1);
      const names = stationsByLine.get(line) ?? [];
      names.push(pickName(station.name, locale));
      stationsByLine.set(line, names);
    }
  }
  return {
    edition: network.timetableEdition,
    sourceUpdatedAt: network.sourceUpdatedAt,
    lines: network.lines.features.map((feature) => ({
      ref: feature.properties.ref,
      name: pickName(feature.properties.name, locale),
      stationCount: stationCountByLine.get(feature.properties.ref) ?? 0,
      stations: stationsByLine.get(feature.properties.ref) ?? [],
    })),
    stations: network.stations.map((station) => ({
      name: pickName(station.name, locale),
      lines: station.lines,
      interchange: station.interchange,
    })),
    note: "The LRT publishes no official live train positions. This is the official network and service notices only.",
  };
}

export function matchLrtLine(
  question: string,
  network: LrtNetwork | null,
): { ref: string; name: string } | null {
  if (!network || !question.trim()) return null;
  const haystack = question.toLowerCase();
  for (const feature of network.lines.features) {
    const baseNames = [
      feature.properties.name["zh-Hant"],
      feature.properties.name["zh-Hans"],
      feature.properties.name.en,
    ]
      .filter(Boolean)
      .map((name) => name.split(/[（(]/)[0].trim());
    const names = [...baseNames, feature.properties.ref].filter(Boolean);
    const hit = names.some((name) => {
      const normalized = name.trim().toLowerCase();
      if (!normalized) return false;
      const isCjk = /[\u3400-\u9fff]/.test(name);
      if (isCjk ? normalized.length < 3 : normalized.length < 4) return false;
      return haystack.includes(normalized);
    });
    if (hit) {
      return {
        ref: feature.properties.ref,
        name: pickName(feature.properties.name, "zh-Hant"),
      };
    }
  }
  return null;
}

export function matchLrtStation(
  question: string,
  network: LrtNetwork | null,
): LrtNetwork["stations"][number] | null {
  if (!network || !question.trim()) return null;
  const haystack = question.toLowerCase();
  for (const station of network.stations) {
    const names = [
      station.name["zh-Hant"],
      station.name["zh-Hans"],
      station.name.en,
    ].filter(Boolean);
    const hit = names.some((name) => {
      const normalized = name.trim().toLowerCase();
      if (!normalized) return false;
      const isCjk = /[\u3400-\u9fff]/.test(name);
      if (isCjk ? normalized.length < 3 : normalized.length < 4) return false;
      return haystack.includes(normalized);
    });
    if (hit) return station;
  }
  return null;
}

function summariseRoads(
  roads: RoadCollection | null,
  locale: Locale,
  question: string,
): LearningSnapshot["roads"] {
  if (!roads) return null;

  const counts = { normal: 0, slow: 0, congested: 0, unknown: 0 };
  for (const feature of roads.features) {
    counts[feature.properties.status] += 1;
  }

  const toEntry = (feature: RoadCollection["features"][number]) => ({
    name: pickName(feature.properties.name, locale),
    lengthMeters: Math.round(feature.properties.lengthMeters),
  });

  const congestedSegments = roads.features
    .filter((feature) => feature.properties.status === "congested")
    .slice(0, 12)
    .map(toEntry);
  const slowSegments = roads.features
    .filter((feature) => feature.properties.status === "slow")
    .sort((a, b) => b.properties.lengthMeters - a.properties.lengthMeters)
    .slice(0, 10)
    .map(toEntry);

  return {
    monitoredSegments: roads.features.length,
    counts,
    congestedSegments,
    slowSegments,
    mentionedSegments: findMentionedSegments(question, roads, locale),
    note: `Live status covers only the ${roads.features.length} segments the official feed monitors; streets outside that set have no live status.`,
  };
}

function summariseBridges(
  bridges: BridgeTime[] | null,
  locale: Locale,
): LearningSnapshot["bridges"] {
  if (!bridges) return null;
  return bridges.map((bridge) => ({
    name: pickName(bridge.name, locale),
    direction: bridge.direction,
    travelMinutes: Math.round(bridge.runtimeSeconds / 60),
    status: bridge.status,
  }));
}

function summariseWeather(weather: WeatherSnapshot | null): LearningSnapshot["weather"] {
  if (!weather) return null;
  return {
    observedAt: weather.observedAt,
    temperatureCelsius: weather.temperatureCelsius,
    humidityPercent: weather.humidityPercent,
    wind: weather.wind,
    activeWarnings: weather.warnings
      .filter((warning) => warning.active)
      .slice(0, 3)
      .map((warning) => truncate(warning.text, 220)),
  };
}

function summariseParking(
  parking: ParkingFacility[] | null,
): LearningSnapshot["parking"] {
  if (!parking) return null;
  return [...parking]
    .sort(
      (a, b) =>
        (b.availability.lightVehicle ?? -1) - (a.availability.lightVehicle ?? -1),
    )
    .slice(0, 6)
    .map((facility) => ({
      name: facility.name,
      areaStatus: facility.areaStatus,
      lightVehicle: facility.availability.lightVehicle,
    }));
}

function summariseBorders(
  borders: BorderStatus[] | null,
  locale: Locale,
): LearningSnapshot["borders"] {
  if (!borders) return null;
  return borders.map((border) => ({
    name: pickName(border.name, locale),
    status: border.status,
    estimatedWaitMinutes: border.estimatedWaitMinutes,
  }));
}

function summariseNotices(
  notices: TrafficNotice[] | null,
): LearningSnapshot["notices"] {
  if (!notices) return null;
  return notices.slice(0, 5).map((notice) => ({
    title: notice.title,
    category: notice.category,
    publishedAt: notice.publishedAt,
  }));
}

function summariseLrtNotices(
  notices: LrtNotice[] | null,
): LearningSnapshot["lrtNotices"] {
  if (!notices) return null;
  return notices
    .filter((notice) => notice.active)
    .slice(0, 3)
    .map((notice) => ({ title: notice.title, active: notice.active }));
}

export const BUS_POSITION_NOTE =
  "Live bus positions are estimated along the official route from the stop each bus is approaching; they are not GPS readings. Direction 0 is the outbound trip and direction 1 is the return trip.";

function summariseBusSlice(
  eta: BusEta,
): NonNullable<LearningSnapshot["bus"]>["liveRoutes"][number] {
  const segmentTraffic = { normal: 0, slow: 0, congested: 0, unknown: 0 };
  for (const segment of eta.routeSegments) {
    segmentTraffic[segment.trafficStatus] += 1;
  }

  return {
    routeName: eta.routeName,
    direction: eta.direction,
    liveVehicleCount: eta.vehicles.length,
    vehicles: eta.vehicles.slice(0, 6).map((vehicle) => ({
      plate: vehicle.plate,
      approachingStop: vehicle.stationName,
      speedKph: vehicle.speedKph,
      lowFloor: vehicle.lowFloor,
    })),
    nextStops: eta.stops.slice(0, 8).map((stop) => ({
      stationName: stop.stationName,
      etaMinutes: stop.etaMinutes,
      trafficStatus: stop.trafficStatus,
    })),
    stops: eta.stops.map((stop) => stop.stationName),
    suspendedStops: eta.diversion.suspendedStops.map((stop) => stop.stationName),
    segmentTraffic,
  };
}

function busEtaSourceDefinition(slice: AssistantFocus): SourceDefinition<BusEta> {
  const normalizedCode = slice.routeCode.toUpperCase();
  return {
    id: `bus-eta-${normalizedCode}-${slice.direction}`,
    name: `Bus ${normalizedCode} arrivals`,
    url: "https://bis.dsat.gov.mo:37812/macauweb/",
    attribution: "DSAT public bus arrival data",
    envKey: "SOURCE_BUS_ENABLED",
    ttlSeconds: 10,
    staleTtlSeconds: 60,
    schema: busEtaSchema,
    load: () => loadBusEta(normalizedCode, slice.direction),
  };
}

export async function buildLearningSnapshot(
  locale: Locale,
  options: { focus?: AssistantFocus; question?: string } = {},
): Promise<{
  snapshot: LearningSnapshot;
  refreshes: Array<() => Promise<void>>;
  action?: LearningAssistantAction;
}> {
  const refreshes: Array<() => Promise<void>> = [];
  const question = options.question ?? "";
  const focus = options.focus;

  const [
    roads,
    bridges,
    weather,
    parking,
    borders,
    notices,
    lrtNotices,
    lrtNetwork,
  ] = await Promise.all([
    readSource(sources.roads),
    readSource(sources.bridges),
    readSource(sources.weather),
    readSource(sources.parking),
    readSource(sources.borders),
    readSource(sources.notices),
    readSource(sources.lrtNotices),
    readSource(sources.lrtNetwork),
  ]);

  const baseReads: Array<SourceRead<unknown> | null> = [
    roads,
    bridges,
    weather,
    parking,
    borders,
    notices,
    lrtNotices,
    lrtNetwork,
  ];
  for (const read of baseReads) {
    if (read?.refresh) refreshes.push(read.refresh);
  }

  const busRelated =
    Boolean(focus) || (question ? looksBusRelated(question) : false);
  let catalog: BusRoute[] | null = null;
  if (busRelated) {
    const catalogRead = await readSource(sources.busRoutes);
    if (catalogRead) {
      catalog = catalogRead.result.data;
      if (catalogRead.refresh) refreshes.push(catalogRead.refresh);
    }
  }
  const matchedRoutes = catalog ? matchNamedRoutes(question, catalog) : [];

  const wanted: AssistantFocus[] = [];
  if (focus) wanted.push(focus);
  for (const route of matchedRoutes) {
    const directions: Array<0 | 1> = matchedRoutes.length > 1 ? [0] : [0, 1];
    for (const direction of directions) {
      wanted.push({ routeCode: route.routeCode, direction });
    }
  }
  const uniqueWanted: AssistantFocus[] = [];
  const seenWanted = new Set<string>();
  for (const slice of wanted) {
    const key = `${slice.routeCode.toUpperCase()}-${slice.direction}`;
    if (seenWanted.has(key)) continue;
    seenWanted.add(key);
    uniqueWanted.push({
      routeCode: slice.routeCode.toUpperCase(),
      direction: slice.direction,
    });
    if (uniqueWanted.length >= 3) break;
  }

  const busReads = await Promise.all(
    uniqueWanted.map((slice) => readSource(busEtaSourceDefinition(slice))),
  );
  for (const read of busReads) {
    if (read?.refresh) refreshes.push(read.refresh);
  }
  const liveRoutes = busReads
    .filter((read): read is SourceRead<BusEta> => Boolean(read))
    .map((read) => summariseBusSlice(read.result.data));

  const place = question ? extractPlaceQuery(question) : null;
  let placeCheck: NonNullable<LearningSnapshot["bus"]>["placeCheck"] = null;
  if (place && liveRoutes.length) {
    const servedSlice = liveRoutes.find((slice) =>
      slice.stops.some((stop) => stop.includes(place)),
    );
    placeCheck = {
      place,
      served: Boolean(servedSlice),
      direction: servedSlice ? servedSlice.direction : null,
    };
  }

  const network = lrtNetwork?.result.data ?? null;
  let action: LearningAssistantAction | undefined;
  if (matchedRoutes.length && liveRoutes.length) {
    const mentionedStopDirection =
      liveRoutes.find((slice) =>
        slice.stops.some((stop) => {
          const name = stop.trim();
          if (name.length < 3) return false;
          return (
            question.includes(name) ||
            question.toLowerCase().includes(name.toLowerCase())
          );
        }),
      )?.direction ?? null;
    action = {
      kind: "bus",
      routeCode: matchedRoutes[0].routeCode,
      direction: placeCheck?.direction ?? mentionedStopDirection ?? 0,
    };
  } else if (network) {
    const line = matchLrtLine(question, network);
    const station = matchLrtStation(question, network);
    if (line) action = { kind: "lrt", lineRef: line.ref };
    else if (station) action = { kind: "lrt", lineRef: station.lines[0] };
  }

  const snapshot: LearningSnapshot = {
    generatedAt: new Date().toISOString(),
    weather: summariseWeather(weather?.result.data ?? null),
    bridges: summariseBridges(bridges?.result.data ?? null, locale),
    roads: summariseRoads(roads?.result.data ?? null, locale, question),
    parking: summariseParking(parking?.result.data ?? null),
    borders: summariseBorders(borders?.result.data ?? null, locale),
    notices: summariseNotices(notices?.result.data ?? null),
    lrtNotices: summariseLrtNotices(lrtNotices?.result.data ?? null),
    bus: busRelated
      ? {
          catalogAvailable: Boolean(catalog),
          routeCount: catalog?.length ?? 0,
          routeNames: catalog?.map((route) => route.routeName) ?? [],
          matchedRoutes: matchedRoutes.map((route) => ({
            route: route.routeName,
            company: route.company.name,
            liveTracking: route.live,
            liveDataLoaded: liveRoutes.some(
              (slice) => slice.routeName === route.routeName,
            ),
          })),
          placeCheck,
          liveRoutes,
          note: BUS_POSITION_NOTE,
        }
      : null,
    lrt: summariseLrt(network, locale),
  };

  return { snapshot, refreshes, action };
}

const localeName: Record<Locale, string> = {
  "zh-Hant": "Traditional Chinese as written in Macao",
  "zh-Hans": "Simplified Chinese",
  en: "English",
};

export function buildAssistantMessages(
  question: string,
  locale: Locale,
  snapshot: LearningSnapshot,
): Array<{ role: "system" | "user"; content: string }> {
  const system = [
    "You are the assistant inside Macau Traffic Intelligence, a public information service for Macau's live transport data. Users include residents, commuters, visitors, students, and teachers.",
    `Answer in ${localeName[locale]}.`,
    "Use the LIVE DATA SNAPSHOT in the user message as the only source of current traffic, weather, and transport facts. Never invent numbers, road names, bus routes, or events. If the snapshot does not contain what is needed, say what is missing and point to the relevant tab of the app (Overview, Bus, LRT, Parking, Notices, Cameras).",
    `When you quote a live value, mention that it comes from the snapshot taken at ${snapshot.generatedAt}.`,
    "Explain, do not just answer: give a short direct answer first, then one or two sentences on how to read or compare the data. When the request is practical, end with what to check next in the app. When the user is likely learning, or the question is about the data itself, end with one small follow-up question or observation task instead.",
    "Do not repeat or restate the user's question at the start of the reply.",
    "Before stating which item is highest or lowest, list the values you are comparing so the comparison can be checked.",
    "When the snapshot cannot explain why something happens, say which extra data or field observation would be needed instead of guessing a cause.",
    "The snapshot may include roads.mentionedSegments (each with a segment count, status breakdown, and total length), roads.congestedSegments, roads.slowSegments, and bus.liveRoutes. Use them for questions about a specific road, bus route, bus position, or route traffic.",
    "For bus answers, name the stop each bus is approaching and always state that positions are estimated from the official arrival feed, not GPS. When one route is named, bus.liveRoutes carries both directions: call direction 0 the outbound trip and direction 1 the return trip, and never invent destination or terminal names that are not written in the snapshot.",
    "bus.liveRoutes[].stops lists every stop of that route in order. When asked whether a route serves a place, decide yes or no from the stop list and answer that in the first sentence; only then name the relevant stops. If the place is not in the list, say it is not served and do not imply otherwise.",
    "If bus.placeCheck is present, its served value is the authoritative answer to whether that route serves the place. The system adds an opening line with that value, so confirm it and never contradict it. Keep the reply to at most three short sentences: the served value, up to three nearby stops from the stop list, and a next step.",
    "If a named route is not in bus.liveRoutes, or a named road is not in roads.mentionedSegments, say that the live detail was not loaded instead of guessing.",
    "lrt lists the official LRT network: lines, stations, and interchanges. lrt.lines[].stations lists the station names of each line; if asked how many stations a line has, count that list. The LRT has no official live train-position feed, so never claim a train position or a countdown; use the LRT service notices for service status.",
    "Never mention JSON field names such as liveVehicleCount or segmentTraffic in the answer; describe the same facts in plain words.",
    "Keep units as published (minutes, °C, km/h, number of spaces). Structure comparisons as short lists or sentences, not tables.",
    "Live readings change quickly; describe what the data shows now and never promise that a condition will persist.",
    "Do not give turn-by-turn driving directions. For travel decisions, remind the user that official apps and on-site signs are authoritative.",
    "Never ask for or repeat personal data. The snapshot contains public government data only.",
    "Keep the whole reply under 220 words.",
  ].join("\n");

  const user = [
    "USER QUESTION:",
    question,
    "",
    "LIVE DATA SNAPSHOT (JSON):",
    JSON.stringify(snapshot),
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

const providerResponseSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string() }) }))
    .min(1),
});

export function assistantModelName(): string {
  return process.env.ASSISTANT_MODEL ?? ASSISTANT_DEFAULT_MODEL;
}

export function assistantProviderOrigin(): string {
  const baseUrl = process.env.ASSISTANT_BASE_URL ?? ASSISTANT_DEFAULT_BASE_URL;
  try {
    return new URL(baseUrl).origin;
  } catch {
    return ASSISTANT_DEFAULT_BASE_URL;
  }
}

export function assistantConfigured(): boolean {
  return sourceEnabled("SOURCE_ASSISTANT_ENABLED") && Boolean(process.env.ASSISTANT_API_KEY);
}

export async function callAssistantProvider(
  messages: Array<{ role: "system" | "user"; content: string }>,
): Promise<string> {
  const apiKey = process.env.ASSISTANT_API_KEY;
  if (!apiKey) throw new Error("assistant_unconfigured");

  const baseUrl = (process.env.ASSISTANT_BASE_URL ?? ASSISTANT_DEFAULT_BASE_URL).replace(
    /\/+$/,
    "",
  );
  const timeoutMs = Number(process.env.ASSISTANT_TIMEOUT_MS ?? 25_000);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: assistantModelName(),
      messages,
      temperature: 0.3,
      max_tokens: 800,
      stream: false,
    }),
    signal: AbortSignal.timeout(Number.isFinite(timeoutMs) ? timeoutMs : 25_000),
  });

  if (!response.ok) {
    throw new Error(`assistant_upstream_${response.status}`);
  }

  const parsed = providerResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("assistant_invalid_response");
  return parsed.data.choices[0].message.content.trim();
}

function contextSummary(snapshot: LearningSnapshot, locale: Locale): string[] {
  const items: string[] = [];
  const join = (zhHant: string, zhHans: string, en: string) =>
    locale === "en" ? en : locale === "zh-Hans" ? zhHans : zhHant;

  if (snapshot.roads) {
    items.push(
      join(
        `道路路況：官方監測 ${snapshot.roads.monitoredSegments} 段，其中 ${snapshot.roads.counts.congested} 段擁塞`,
        `道路路况：官方监测 ${snapshot.roads.monitoredSegments} 段，其中 ${snapshot.roads.counts.congested} 段拥堵`,
        `Road status: ${snapshot.roads.counts.congested} of ${snapshot.roads.monitoredSegments} monitored segments congested`,
      ),
    );
  }
  if (snapshot.bridges) {
    items.push(
      join(
        `跨海大橋行車時間（${snapshot.bridges.length} 項）`,
        `跨海大桥行车时间（${snapshot.bridges.length} 项）`,
        `Bridge travel times (${snapshot.bridges.length} readings)`,
      ),
    );
  }
  if (snapshot.weather) {
    items.push(
      join(
        `天氣：${snapshot.weather.temperatureCelsius ?? "--"}°C、濕度 ${snapshot.weather.humidityPercent ?? "--"}%`,
        `天气：${snapshot.weather.temperatureCelsius ?? "--"}°C、湿度 ${snapshot.weather.humidityPercent ?? "--"}%`,
        `Weather: ${snapshot.weather.temperatureCelsius ?? "--"}°C, humidity ${snapshot.weather.humidityPercent ?? "--"}%`,
      ),
    );
  }
  if (snapshot.parking) {
    items.push(
      join(
        `停車場：空位最多的 ${snapshot.parking.length} 個停車場`,
        `停车场：空位最多的 ${snapshot.parking.length} 个停车场`,
        `Parking: ${snapshot.parking.length} facilities with the most free spaces`,
      ),
    );
  }
  if (snapshot.borders) {
    items.push(
      join(
        `口岸：${snapshot.borders.length} 個口岸狀態`,
        `口岸：${snapshot.borders.length} 个口岸状态`,
        `Borders: status for ${snapshot.borders.length} checkpoints`,
      ),
    );
  }
  if (snapshot.notices) {
    items.push(
      join(
        `交通消息：最新 ${snapshot.notices.length} 則`,
        `交通消息：最新 ${snapshot.notices.length} 则`,
        `Traffic notices: latest ${snapshot.notices.length}`,
      ),
    );
  }
  if (snapshot.lrtNotices) {
    items.push(
      join(
        `輕軌服務公告：生效中的 ${snapshot.lrtNotices.length} 則`,
        `轻轨服务公告：生效中的 ${snapshot.lrtNotices.length} 则`,
        `LRT service notices: ${snapshot.lrtNotices.length} active`,
      ),
    );
  }
  if (snapshot.lrt) {
    items.push(
      join(
        `輕軌網絡：${snapshot.lrt.lines.length} 條線、${snapshot.lrt.stations.length} 個站；官方無實時列車位置`,
        `轻轨网络：${snapshot.lrt.lines.length} 条线、${snapshot.lrt.stations.length} 个站；官方无实时列车位置`,
        `LRT network: ${snapshot.lrt.lines.length} lines, ${snapshot.lrt.stations.length} stations; no official live train positions`,
      ),
    );
  }
  if (snapshot.bus && snapshot.bus.liveRoutes.length) {
    const routes = snapshot.bus.liveRoutes
      .map(
        (route) =>
          `${route.routeName}（${route.direction === 0 ? "去程" : "回程"}）`,
      )
      .join("、");
    const routesHans = snapshot.bus.liveRoutes
      .map(
        (route) =>
          `${route.routeName}（${route.direction === 0 ? "去程" : "回程"}）`,
      )
      .join("、");
    const routesEn = snapshot.bus.liveRoutes
      .map(
        (route) =>
          `${route.routeName} (${route.direction === 0 ? "outbound" : "return"})`,
      )
      .join(", ");
    items.push(
      join(
        `巴士實時：${routes} 的車輛位置、到站與沿線路況`,
        `巴士实时：${routesHans} 的车辆位置、到站与沿线路况`,
        `Live bus data: vehicles, arrivals, and route traffic for ${routesEn}`,
      ),
    );
  } else if (snapshot.bus) {
    items.push(
      join(
        `巴士路線目錄：${snapshot.bus.routeCount} 條`,
        `巴士路线目录：${snapshot.bus.routeCount} 条`,
        `Bus route catalog: ${snapshot.bus.routeCount} routes`,
      ),
    );
  }

  return items;
}

function placeCheckSentence(
  check: NonNullable<NonNullable<LearningSnapshot["bus"]>["placeCheck"]>,
  route: string,
  locale: Locale,
): string {
  const direction =
    check.direction === null
      ? null
      : locale === "en"
        ? check.direction === 0
          ? "outbound"
          : "return"
        : check.direction === 0
          ? "去程"
          : "回程";
  if (locale === "en") {
    return check.served
      ? `Checked against the official stop list: route ${route} does serve ${check.place}${direction ? ` (${direction} trip)` : ""}.`
      : `Checked against the official stop list: route ${route} does not serve ${check.place}.`;
  }
  const isSimplified = locale === "zh-Hans";
  const label = isSimplified ? "核对官方站表" : "核對官方站表";
  const verb = isSimplified
    ? check.served
      ? "会经过"
      : "不经过"
    : check.served
      ? "會經過"
      : "不經過";
  const word = isSimplified ? "路线" : "路線";
  const suffix = direction ? `（${direction}）` : "";
  return `${label}：${route} ${word}${verb}「${check.place}」${suffix}。`;
}

export async function askLearningAssistant(params: {
  question: string;
  locale: Locale;
  focus?: AssistantFocus;
}): Promise<AssistantAnswerResult> {
  const { snapshot, refreshes, action } = await buildLearningSnapshot(
    params.locale,
    { focus: params.focus, question: params.question },
  );
  const modelAnswer = await callAssistantProvider(
    buildAssistantMessages(params.question, params.locale, snapshot),
  );
  const placeCheck = snapshot.bus?.placeCheck;
  const checkedRoute = snapshot.bus?.matchedRoutes[0]?.route;
  const factLine =
    placeCheck && checkedRoute
      ? placeCheckSentence(placeCheck, checkedRoute, params.locale)
      : null;
  const answerText = factLine ? `${factLine}\n\n${modelAnswer}` : modelAnswer;

  return {
    answer: {
      answer: answerText,
      model: assistantModelName(),
      locale: params.locale,
      snapshotAt: snapshot.generatedAt,
      contextSummary: contextSummary(snapshot, params.locale),
      ...(action ? { action } : {}),
    },
    refreshes,
  };
}
