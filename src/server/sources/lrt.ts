import "server-only";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import networkJson from "../../../data/lrt-network.json";
import { lrtNoticeSchema } from "@/lib/contracts";
import { fetchText } from "@/server/http";
import type { SourceDefinition } from "@/server/source";

const NOTICE_RSS = "https://www.mlm.com.mo/rss/tc/notice.rss";
const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });

const localizedSchema = z.object({
  "zh-Hant": z.string(),
  "zh-Hans": z.string(),
  pt: z.string().optional(),
  en: z.string(),
});

const lrtNetworkSchema = z.object({
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

function first<T>(value: T | T[] | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function loadLrtNetwork() {
  return lrtNetworkSchema.parse(networkJson);
}

export async function loadLrtNotices() {
  const xml = await fetchText(NOTICE_RSS);
  const parsed = parser.parse(xml);
  const rawItems = first(parsed?.rss?.channel?.item);
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

  return items
    .map((item: Record<string, unknown>) => {
      const id = String(item.id ?? item.guid ?? item.pubDate ?? "");
      const title = String(item.title ?? "").trim();
      const content = String(item["content:encoded"] ?? item.description ?? "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const publishedAt = String(item.pubDate ?? "");
      const date = new Date(publishedAt);
      const active = String(item.show ?? "true") !== "false";

      if (!id || !content || Number.isNaN(date.getTime())) return null;

      return lrtNoticeSchema.parse({
        id,
        title: title || content.slice(0, 80),
        content,
        publishedAt: date.toISOString(),
        active,
      });
    })
    .filter((notice): notice is NonNullable<typeof notice> => notice !== null)
    .slice(0, 30);
}

export const lrtNetworkSource: SourceDefinition<Awaited<ReturnType<typeof loadLrtNetwork>>> = {
  id: "lrt-network",
  name: "澳門輕軌固定網絡",
  url: "https://www.mlm.com.mo/tc/route.html",
  attribution: "澳門輕軌官方路線站點及 OpenStreetMap ODbL 幾何資料",
  envKey: "SOURCE_LRT_ENABLED",
  ttlSeconds: 86_400,
  staleTtlSeconds: 2_592_000,
  schema: lrtNetworkSchema,
  load: loadLrtNetwork,
};

export const lrtNoticesSource: SourceDefinition<Awaited<ReturnType<typeof loadLrtNotices>>> = {
  id: "lrt-notices",
  name: "澳門輕軌營運公告",
  url: NOTICE_RSS,
  attribution: "澳門輕軌股份有限公司官方 RSS 告示",
  envKey: "SOURCE_LRT_ENABLED",
  ttlSeconds: 300,
  staleTtlSeconds: 86_400,
  schema: z.array(lrtNoticeSchema),
  load: loadLrtNotices,
};
