import "server-only";
import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";
import { officialNewsSchema } from "@/lib/contracts";
import type { TrafficNotice } from "@/lib/types";
import { fetchText } from "@/server/http";
import type { SourceDefinition } from "@/server/source";

const feeds = [
  { id: "gcs" as const, name: "新聞局政府新聞", url: "https://govinfohub.gcs.gov.mo/api/rss/n/zh-hant", host: "www.gcs.gov.mo" },
  { id: "dsat" as const, name: "交通事務局新聞", url: "https://www.dsat.gov.mo/tc/news_rss.aspx", host: "www.dsat.gov.mo" },
];
const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
const transport = /交通|巴士|輕軌|停車|泊車|封路|封閉|改道|通車|口岸|客船|航班|渡輪|客運|隧道|大橋/;

export function parseOfficialNewsRss(xml: string, publisher: "gcs" | "dsat"): TrafficNotice[] {
  const channel = parser.parse(xml)?.rss?.channel;
  if (!channel) throw new Error(`${publisher} returned no RSS channel`);
  const items = channel.item ? (Array.isArray(channel.item) ? channel.item : [channel.item]) : [];
  const definition = feeds.find((feed) => feed.id === publisher)!;
  return items.flatMap((item: Record<string, unknown>) => {
    const title = String(item.title ?? "").trim();
    if (!title || (publisher === "gcs" && !transport.test(title))) return [];
    let url: URL;
    try { url = new URL(String(item.link ?? "")); } catch { return []; }
    if (url.protocol !== "https:" || url.hostname !== definition.host) return [];
    const description = item.description && typeof item.description === "object"
      ? (item.description as Record<string, unknown>)["#text"] : item.description;
    const published = Date.parse(String(item.pubDate ?? item["dc:date"] ?? ""));
    return [{
      id: `${publisher}:${url.pathname}${url.search}`,
      title,
      content: cheerio.load(String(description ?? "")).text().replace(/\s+/g, " ").trim().slice(0, 240),
      publishedAt: Number.isFinite(published) ? new Date(published).toISOString() : null,
      category: "general" as const,
      url: url.toString(),
    }];
  });
}

export async function loadOfficialNews() {
  const results = await Promise.allSettled(feeds.map(async (feed) =>
    parseOfficialNewsRss(await fetchText(feed.url, { timeoutMs: 8_000 }), feed.id)));
  if (results.every((result) => result.status === "rejected")) throw new Error("Official news feeds unavailable");
  const seen = new Set<string>();
  const items = results.flatMap((result) => result.status === "fulfilled" ? result.value : [])
    .filter((item) => { if (seen.has(item.title)) return false; seen.add(item.title); return true; })
    .sort((a, b) => Date.parse(b.publishedAt ?? "1970-01-01") - Date.parse(a.publishedAt ?? "1970-01-01"));
  return officialNewsSchema.parse({
    items,
    feeds: feeds.map((feed, index) => ({ name: feed.name, url: feed.url, available: results[index].status === "fulfilled" })),
  });
}

export const officialNewsSource: SourceDefinition<Awaited<ReturnType<typeof loadOfficialNews>>> = {
  id: "official-news", name: "政府交通新聞 RSS", url: "https://www.gov.mo/zh-hant/directory/rss-feeds/",
  attribution: "新聞局及交通事務局官方 RSS；發布消息，並非完整即時事故流",
  envKey: "SOURCE_OFFICIAL_NEWS_ENABLED", ttlSeconds: 60, staleTtlSeconds: 3_600,
  schema: officialNewsSchema, load: loadOfficialNews,
};
