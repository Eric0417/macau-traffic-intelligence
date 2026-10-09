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
  LearningAssistantAnswer,
  Locale,
  LocalizedText,
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
  busRoute: {
    routeName: string;
    direction: 0 | 1;
    liveVehicleCount: number;
    suspendedStops: string[];
    nextStops: Array<{ stationName: string; etaMinutes: number | null }>;
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

function summariseRoads(
  roads: RoadCollection | null,
  locale: Locale,
): LearningSnapshot["roads"] {
  if (!roads) return null;

  const counts = { normal: 0, slow: 0, congested: 0, unknown: 0 };
  for (const feature of roads.features) {
    counts[feature.properties.status] += 1;
  }

  const congestedSegments = roads.features
    .filter((feature) => feature.properties.status === "congested")
    .slice(0, 6)
    .map((feature) => ({
      name: pickName(feature.properties.name, locale),
      lengthMeters: Math.round(feature.properties.lengthMeters),
    }));

  return { monitoredSegments: roads.features.length, counts, congestedSegments };
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

function summariseBusRoute(eta: BusEta): NonNullable<LearningSnapshot["busRoute"]> {
  return {
    routeName: eta.routeName,
    direction: eta.direction,
    liveVehicleCount: eta.vehicles.length,
    suspendedStops: eta.diversion.suspendedStops.map((stop) => stop.stationName),
    nextStops: eta.stops.slice(0, 8).map((stop) => ({
      stationName: stop.stationName,
      etaMinutes: stop.etaMinutes,
    })),
  };
}

function busEtaSourceDefinition(focus: AssistantFocus): SourceDefinition<BusEta> {
  const normalizedCode = focus.routeCode.toUpperCase();
  return {
    id: `bus-eta-${normalizedCode}-${focus.direction}`,
    name: `Bus ${normalizedCode} arrivals`,
    url: "https://bis.dsat.gov.mo:37812/macauweb/",
    attribution: "DSAT public bus arrival data",
    envKey: "SOURCE_BUS_ENABLED",
    ttlSeconds: 10,
    staleTtlSeconds: 60,
    schema: busEtaSchema,
    load: () => loadBusEta(normalizedCode, focus.direction),
  };
}

export async function buildLearningSnapshot(
  locale: Locale,
  focus?: AssistantFocus,
): Promise<{ snapshot: LearningSnapshot; refreshes: Array<() => Promise<void>> }> {
  const refreshes: Array<() => Promise<void>> = [];

  const [roads, bridges, weather, parking, borders, notices, lrtNotices, busEta] =
    await Promise.all([
      readSource(sources.roads),
      readSource(sources.bridges),
      readSource(sources.weather),
      readSource(sources.parking),
      readSource(sources.borders),
      readSource(sources.notices),
      readSource(sources.lrtNotices),
      focus ? readSource(busEtaSourceDefinition(focus)) : Promise.resolve(null),
    ]);

  const reads: Array<SourceRead<unknown> | null> = [
    roads,
    bridges,
    weather,
    parking,
    borders,
    notices,
    lrtNotices,
    busEta,
  ];
  for (const read of reads) {
    if (read?.refresh) refreshes.push(read.refresh);
  }

  const snapshot: LearningSnapshot = {
    generatedAt: new Date().toISOString(),
    weather: summariseWeather(weather?.result.data ?? null),
    bridges: summariseBridges(bridges?.result.data ?? null, locale),
    roads: summariseRoads(roads?.result.data ?? null, locale),
    parking: summariseParking(parking?.result.data ?? null),
    borders: summariseBorders(borders?.result.data ?? null, locale),
    notices: summariseNotices(notices?.result.data ?? null),
    lrtNotices: summariseLrtNotices(lrtNotices?.result.data ?? null),
    busRoute: busEta ? summariseBusRoute(busEta.result.data) : null,
  };

  return { snapshot, refreshes };
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
    "Keep units as published (minutes, °C, km/h, number of spaces). Structure comparisons as short lists or sentences, not tables.",
    "Live readings change quickly; describe what the data shows now and never promise that a condition will persist.",
    "Do not give turn-by-turn driving directions. For travel decisions, remind the student that official apps and on-site signs are authoritative.",
    "Never ask for or repeat personal data. The snapshot contains public government data only.",
    "Keep the whole reply under 220 words.",
  ].join("\n");

  const user = [
    "STUDENT QUESTION:",
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
  if (snapshot.busRoute) {
    items.push(
      join(
        `巴士 ${snapshot.busRoute.routeName}：實時車輛 ${snapshot.busRoute.liveVehicleCount} 部及下一批到站`,
        `巴士 ${snapshot.busRoute.routeName}：实时车辆 ${snapshot.busRoute.liveVehicleCount} 部及下一批到站`,
        `Bus ${snapshot.busRoute.routeName}: ${snapshot.busRoute.liveVehicleCount} live vehicles and the next arrivals`,
      ),
    );
  }

  return items;
}

export async function askLearningAssistant(params: {
  question: string;
  locale: Locale;
  focus?: AssistantFocus;
}): Promise<AssistantAnswerResult> {
  const { snapshot, refreshes } = await buildLearningSnapshot(
    params.locale,
    params.focus,
  );
  const answerText = await callAssistantProvider(
    buildAssistantMessages(params.question, params.locale, snapshot),
  );

  return {
    answer: {
      answer: answerText,
      model: assistantModelName(),
      locale: params.locale,
      snapshotAt: snapshot.generatedAt,
      contextSummary: contextSummary(snapshot, params.locale),
    },
    refreshes,
  };
}
