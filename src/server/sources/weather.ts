import "server-only";
import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";
import { weatherSnapshotSchema } from "@/lib/contracts";
import { fetchText } from "@/server/http";
import type { SourceDefinition } from "@/server/source";
import type { WeatherWarning } from "@/lib/types";

const ACTUAL_RSS = "https://rss.smg.gov.mo/c_ActualWeather_rss.xml";
const WARNING_RSS = "https://rss.smg.gov.mo/c_WSignal_rss.xml";
const FORECAST_RSS = "https://rss.smg.gov.mo/c_WForecast_rss.xml";

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

function first<T>(value: T | T[] | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function description(xml: string): string {
  const parsed = parser.parse(xml);
  const channel = parsed?.rss?.channel;
  const item = first(channel?.item);
  return String(item?.description ?? "");
}

function textFromHtml(value: string): string {
  return cheerio.load(value).text().replace(/\s+/g, " ").trim();
}

function numberAfter(text: string, label: string): number | null {
  const match = text.match(new RegExp(`${label}[^\\d]{0,12}(\\d+(?:\\.\\d+)?)`));
  return match ? Number(match[1]) : null;
}

function parseWarningTable(html: string): WeatherWarning[] {
  const $ = cheerio.load(html);
  return $("tr")
    .map((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 3) return null;

      const type = cells.eq(0).text().trim();
      const updatedAt = cells.eq(1).text().trim();
      const text = cells.eq(2).text().replace(/\s+/g, " ").trim();
      if (!type || !text) return null;

      return {
        type,
        updatedAt: updatedAt || null,
        text,
        active: !/現時(?:並)?沒有|現時沒有|no .*warning/i.test(text),
      };
    })
    .get()
    .filter((warning): warning is WeatherWarning => warning !== null);
}

export async function loadWeather() {
  const [actualXml, warningXml, forecastXml] = await Promise.all([
    fetchText(ACTUAL_RSS),
    fetchText(WARNING_RSS),
    fetchText(FORECAST_RSS),
  ]);

  const actualText = textFromHtml(description(actualXml));
  const parsedActual = parser.parse(actualXml);
  const actualTitle = String(
    first(parsedActual?.rss?.channel?.item)?.title ?? first(parsedActual?.rss?.channel?.item)?.pubDate ?? "",
  );
  const forecastText = textFromHtml(description(forecastXml));
  const warnings = parseWarningTable(description(warningXml));

  return weatherSnapshotSchema.parse({
    observedAt: actualTitle || null,
    temperatureCelsius: numberAfter(actualText, "溫度"),
    humidityPercent: numberAfter(actualText, "濕度"),
    wind: actualText.match(/風向:\s*([^;]+);\s*風速:\s*([^ ]+)/)?.[0] ?? null,
    forecast: forecastText || null,
    warnings,
  });
}

export const weatherSource: SourceDefinition<Awaited<ReturnType<typeof loadWeather>>> = {
  id: "weather",
  name: "地球物理氣象局天氣及警告",
  url: "https://www.smg.gov.mo/",
  attribution: "地球物理氣象局官方 RSS 天氣報告、預報及警告",
  envKey: "SOURCE_WEATHER_ENABLED",
  ttlSeconds: 60,
  staleTtlSeconds: 1_800,
  schema: weatherSnapshotSchema,
  load: loadWeather,
};
