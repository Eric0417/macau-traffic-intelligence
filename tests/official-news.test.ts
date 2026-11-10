import { afterEach, describe, expect, it, vi } from "vitest";
import { loadOfficialNews, parseOfficialNewsRss } from "@/server/sources/official-news";

const rss = `<rss xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>
<item><title>福永客船暫停六天</title><link>https://www.gcs.gov.mo/detail/zh-hant/N26KJPCohE</link><description><![CDATA[<p>11月16至21日航班暫停。</p>]]></description><pubDate>2026-11-10T16:16:00+08:00</pubDate><dc:creator>海事及水務局</dc:creator></item>
<item><title>基金會新書出版</title><link>https://www.gcs.gov.mo/detail/zh-hant/OTHER</link><pubDate>2026-11-10T15:00:00+08:00</pubDate></item>
<item><title>巴士改道</title><link>https://evil.example/redirect</link><pubDate>2026-11-10T15:00:00+08:00</pubDate></item>
</channel></rss>`;

afterEach(() => vi.unstubAllGlobals());

describe("official news", () => {
  it("uses publisher dates, strips HTML, filters unrelated news and rejects foreign links", () => {
    const rows = parseOfficialNewsRss(rss, "gcs");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ category: "general", content: "11月16至21日航班暫停。", publishedAt: "2026-11-10T08:16:00.000Z" });
  });

  it("rejects an HTML challenge or a malformed feed instead of reporting zero news", () => {
    expect(() => parseOfficialNewsRss("<html>blocked</html>", "gcs")).toThrow();
  });

  it("reports each failed feed while retaining news from the available feed", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("govinfohub")
      ? new Response(rss) : new Response("unavailable", { status: 403 })));
    const result = await loadOfficialNews();
    expect(result.items).toHaveLength(1);
    expect(result.feeds.map((feed) => feed.available)).toEqual([true, false]);
  });

  it("fails when every publisher is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("blocked", { status: 403 })));
    await expect(loadOfficialNews()).rejects.toThrow();
  });
});
