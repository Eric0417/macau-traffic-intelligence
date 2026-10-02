import "server-only";
import * as cheerio from "cheerio";
import { trafficNoticeSchema } from "@/lib/contracts";
import type { LocalizedText, TrafficNotice } from "@/lib/types";
import { fetchText } from "@/server/http";
import type { SourceDefinition } from "@/server/source";

const noticePages = [
  {
    url: "https://www.dsat.gov.mo/dsat/emergency.aspx",
    category: "incident" as const,
  },
  {
    url: "https://www.dsat.gov.mo/dsat/croad.aspx",
    category: "roadworks" as const,
  },
  {
    url: "https://www.dsat.gov.mo/dsat/bus_croad.aspx",
    category: "bus-change" as const,
  },
];

function absoluteUrl(href: string, base: string): string {
  return new URL(href, base).toString();
}

function publishedAt(text: string): string | null {
  const match = text.match(/(\d{2})-(\d{2})-(\d{4})|(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const value = match[0].includes("-") && match[0].startsWith("20")
    ? match[0]
    : `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(`${value}T00:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dedupe(notices: TrafficNotice[]): TrafficNotice[] {
  const seen = new Set<string>();
  return notices.filter((notice) => {
    const key = `${notice.title}:${notice.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function loadNotices() {
  const results = await Promise.allSettled(
    noticePages.map(async (page) => {
      const html = await fetchText(page.url, { timeoutMs: 8_000 });
      const $ = cheerio.load(html);
      const notices: TrafficNotice[] = [];

      $("a[href]").each((_, anchor) => {
        const href = $(anchor).attr("href") ?? "";
        const title = $(anchor).text().replace(/\s+/g, " ").trim();
        if (
          title.length < 8 ||
          title.length > 160 ||
          !/(events_detail|news_detail|notice_detail|subpage)\.aspx/i.test(href)
        ) {
          return;
        }

        const container = $(anchor).closest("tr, li, article, div");
        const context = container.text().replace(/\s+/g, " ").trim();
        notices.push(
          trafficNoticeSchema.parse({
            id: `${page.category}:${href}`,
            title,
            content: context.slice(0, 320),
            publishedAt: publishedAt(context),
            category: page.category,
            url: absoluteUrl(href, page.url),
          }),
        );
      });

      return notices.slice(0, 30);
    }),
  );

  const notices = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  return dedupe(notices).slice(0, 60);
}

export const noticesSource: SourceDefinition<Awaited<ReturnType<typeof loadNotices>>> = {
  id: "notices",
  name: "DSAT 特別交通消息",
  url: "https://www.dsat.gov.mo/dsat/emergency.aspx",
  attribution: "交通事務局臨時交通、道路工程及巴士改道消息",
  envKey: "SOURCE_NOTICES_ENABLED",
  ttlSeconds: 300,
  staleTtlSeconds: 86_400,
  schema: trafficNoticeSchema.array(),
  load: loadNotices,
};

export const noticeCategoryNames: Record<TrafficNotice["category"], LocalizedText> = {
  incident: {
    "zh-Hant": "突發交通",
    "zh-Hans": "突发交通",
    en: "Incident",
  },
  roadworks: {
    "zh-Hant": "道路工程",
    "zh-Hans": "道路工程",
    en: "Roadworks",
  },
  "bus-change": {
    "zh-Hant": "巴士改道",
    "zh-Hans": "巴士改道",
    en: "Bus change",
  },
  general: {
    "zh-Hant": "交通消息",
    "zh-Hans": "交通消息",
    en: "Traffic notice",
  },
};
