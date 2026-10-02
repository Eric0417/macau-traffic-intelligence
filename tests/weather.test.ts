import { afterEach, describe, expect, it, vi } from "vitest";
import { loadWeather } from "@/server/sources/weather";

const actual = `<?xml version="1.0"?><rss><channel><item><title>澳門天氣報告</title><description><![CDATA[溫度: 28度 濕度: 89 % 風向: 東南偏東 ; 風速: 8.6 公里/小時]]></description></item></channel></rss>`;
const warning = `<?xml version="1.0"?><rss><channel><item><description><![CDATA[<table><tr><td><a>暴雨</a></td><td>2026-10-02 09:15</td><td>現時沒有暴雨警告信號。</td></tr><tr><td><a>雷暴</a></td><td>2026-10-02 09:15</td><td>雷暴警告生效。</td></tr></table>]]></description></item></channel></rss>`;
const forecast = `<?xml version="1.0"?><rss><channel><item><description><![CDATA[大致多雲。<br/>有幾陣驟雨。]]></description></item></channel></rss>`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadWeather", () => {
  it("combines current weather, forecast and warnings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("ActualWeather")) return Promise.resolve(new Response(actual));
        if (url.includes("WSignal")) return Promise.resolve(new Response(warning));
        return Promise.resolve(new Response(forecast));
      }),
    );

    const snapshot = await loadWeather();

    expect(snapshot.temperatureCelsius).toBe(28);
    expect(snapshot.humidityPercent).toBe(89);
    expect(snapshot.forecast).toContain("大致多雲");
    expect(snapshot.warnings).toEqual([
      expect.objectContaining({ type: "暴雨", active: false }),
      expect.objectContaining({ type: "雷暴", active: true }),
    ]);
  });
});
