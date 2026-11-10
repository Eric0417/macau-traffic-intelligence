import { describe, expect, it } from "vitest";
import { parseLrtNotices } from "@/server/sources/lrt";

describe("LRT notice publication", () => {
  it("preserves every item, honours hidden notices and interprets publisher CST as Macau time", () => {
    const data = parseLrtNotices(`<rss><channel><item><id>17372</id><title>舊故障公告</title><description>服務曾中斷</description><pubDate>Sun, 29 Sep 2024 14:41:07 CST</pubDate><show>false</show></item><item><id>17370</id><title>第二則舊公告</title><description>歷史資料</description><pubDate>Sun, 29 Sep 2024 13:51:57 CST</pubDate><show>false</show></item></channel></rss>`);
    expect(data).toHaveLength(2);
    expect(data.every((notice) => !notice.active)).toBe(true);
    expect(data[0].publishedAt).toBe("2024-09-29T06:41:07.000Z");
  });

  it("does not treat a missing display flag as a current notice", () => {
    const data = parseLrtNotices(`<rss><channel><item><id>test</id><description>無展示狀態</description><pubDate>2026-11-10T10:00:00+08:00</pubDate></item></channel></rss>`);
    expect(data[0].active).toBe(false);
  });
});
