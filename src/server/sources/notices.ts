import "server-only";
import * as cheerio from "cheerio";
import { trafficNoticeSchema } from "@/lib/contracts";
import type { LocalizedText, TrafficNotice } from "@/lib/types";
import { fetchText } from "@/server/http";
import type { SourceDefinition } from "@/server/source";

const noticePages = [
  {
    url: "https://www.dsat.gov.mo/dsat/emergency.aspx",
    kind: "emergency" as const,
  },
  {
    url: "https://www.dsat.gov.mo/dsat/croad.aspx",
    kind: "croad" as const,
  },
  {
    url: "https://www.dsat.gov.mo/dsat/bus_croad.aspx",
    kind: "bus" as const,
  },
];

// Unexpected events, not scheduled works: accidents, fires, flooding, fallen
// trees, urgent repairs, and similar interruptions.
const INCIDENT_PATTERN =
  /意外|事故|火警|起火|水浸|塌樹|樹木倒塌|倒塌|倒樹|相撞|撞車|撞傷|撞倒|碰撞|失控|傷者|救援|危險品|油污|緊急/;

function absoluteUrl(href: string, base: string): string {
  return new URL(href, base).toString();
}

function parseDate(text: string): string | null {
  const iso = text.match(/20\d{2}-\d{2}-\d{2}/g);
  if (iso?.length) {
    // A roadwork window "start - end" sorts by when it starts.
    const value = iso[0];
    const date = new Date(`${value}T00:00:00+08:00`);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const local = [...text.matchAll(/(\d{2})-(\d{2})-(20\d{2})/g)];
  if (local.length) {
    const match = local[local.length - 1];
    const date = new Date(`${match[3]}-${match[2]}-${match[1]}T00:00:00+08:00`);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function categoryFor(
  fallback: TrafficNotice["category"],
  text: string,
): TrafficNotice["category"] {
  return INCIDENT_PATTERN.test(text) ? "incident" : fallback;
}

export function parseEmergencyHtml(html: string, base: string): TrafficNotice[] {
  const $ = cheerio.load(html);
  const notices: TrafficNotice[] = [];

  $(".my_news_list").each((_, block) => {
    const element = $(block);
    const anchor = element.find('a[href*="emergency_detail.aspx"]').first();
    const href = anchor.attr("href");
    if (!href) return;
    const title = clean(
      element.find(".news_content span").first().text() || anchor.text(),
    );
    if (title.length < 4) return;

    // The list hides the location summary in an HTML comment. Read it back so
    // the map can match road names in the message.
    const raw = $.html(element) ?? "";
    const comment = raw.match(/<!--([\s\S]*?)-->/)?.[1] ?? "";
    const summary = comment ? clean(cheerio.load(comment).text()) : "";

    notices.push(
      trafficNoticeSchema.parse({
        id: `emergency:${href}`,
        title,
        content: summary || title,
        publishedAt: parseDate(element.find(".news_date").text()),
        category: categoryFor("roadworks", `${title} ${summary}`),
        url: absoluteUrl(href, base),
      }),
    );
  });

  return notices;
}

export function parseCroadHtml(html: string, base: string): TrafficNotice[] {
  const $ = cheerio.load(html);
  const notices: TrafficNotice[] = [];

  $(".my_news_list").each((_, block) => {
    const element = $(block);
    const anchor = element.find('a[href*="croad_detail.aspx"]').first();
    const href = anchor.attr("href");
    if (!href) return;
    const text = clean(element.find(".news_content").text());
    if (text.length < 8) return;

    notices.push(
      trafficNoticeSchema.parse({
        id: `roadworks:${href}`,
        title: text,
        content: text,
        publishedAt: parseDate(text),
        category: categoryFor("roadworks", text),
        url: absoluteUrl(href, base),
      }),
    );
  });

  return notices;
}

export function parseBusCroadHtml(html: string, base: string): TrafficNotice[] {
  const $ = cheerio.load(html);
  const notices: TrafficNotice[] = [];

  $(".my_news_list").each((_, block) => {
    const element = $(block);
    const anchor = element.find('a[href*="bus_croad_detail.aspx"]').first();
    const href = anchor.attr("href");
    if (!href) return;
    const paragraphs = element.find(".news_content p");
    const title = clean(paragraphs.eq(0).text());
    const summary = clean(paragraphs.eq(1).text());
    if (title.length < 4) return;

    notices.push(
      trafficNoticeSchema.parse({
        id: `bus-change:${href}`,
        title,
        content: summary || title,
        publishedAt: parseDate(element.find(".news_date").text()),
        category: categoryFor("bus-change", `${title} ${summary}`),
        url: absoluteUrl(href, base),
      }),
    );
  });

  return notices;
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

function byDateDesc(a: TrafficNotice, b: TrafficNotice): number {
  return Date.parse(b.publishedAt ?? "1970-01-01") - Date.parse(a.publishedAt ?? "1970-01-01");
}

export async function loadNotices() {
  const results = await Promise.allSettled(
    noticePages.map(async (page) => {
      const html = await fetchText(page.url, { timeoutMs: 8_000 });
      const notices =
        page.kind === "emergency"
          ? parseEmergencyHtml(html, page.url)
          : page.kind === "croad"
            ? parseCroadHtml(html, page.url)
            : parseBusCroadHtml(html, page.url);
      return notices.slice(0, 40);
    }),
  );

  const notices = dedupe(
    results.flatMap((result) => (result.status === "fulfilled" ? result.value : [])),
  );
  const incidents = notices.filter((notice) => notice.category === "incident").sort(byDateDesc);
  const rest = notices.filter((notice) => notice.category !== "incident").sort(byDateDesc);
  return [...incidents, ...rest].slice(0, 60);
}

export const noticesSource: SourceDefinition<Awaited<ReturnType<typeof loadNotices>>> = {
  id: "notices",
  name: "DSAT 特別交通消息",
  url: "https://www.dsat.gov.mo/dsat/emergency.aspx",
  attribution: "交通事務局突發交通、臨時交通安排及巴士改道消息",
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
