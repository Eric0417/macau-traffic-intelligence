import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseLrtService, lrtServiceSource } from "@/server/sources/lrt-service";

const html = readFileSync(new URL("./fixtures/lrt-service.html", import.meta.url), "utf8");

describe("official LRT service page", () => {
  it("reads the current tab and 17 timetable links without importing the obsolete service block", () => {
    const service = parseLrtService(html);
    expect(service.lines).toHaveLength(3);
    expect(service.lines[0].frequency).toBe("約5 - 10.5分鐘一班");
    expect(service.lines[0].weekdayHours).toBe("06:30 - 23:15");
    expect(service.lines[0].weekendHours).toBe("06:30 - 23:59");
    expect(service.lines.flatMap((line) => line.timetables)).toHaveLength(17);
    expect(service.lines[0].timetables[0].url).toBe("https://www.mlm.com.mo/images/stations/TimeTable/2026_09/TT_BAR_2026_09_V2.jpg");
    expect(service.revisionNote).toContain("2026年9月");
    expect(lrtServiceSource.ttlSeconds).toBe(21_600);
    expect(lrtServiceSource.staleTtlSeconds).toBe(86_400);
  });

  it("fails closed when the current service tab is absent", () => {
    expect(() => parseLrtService('<div>服務時間：每天06:30 – 23:15</div>')).toThrow();
  });

  it("does not expose a foreign timetable URL from publisher markup", () => {
    const service = parseLrtService(html.replaceAll("/images/stations/TimeTable/2026_09/TT_BAR_2026_09_V2.jpg", "https://example.com/untrusted.jpg"));
    expect(service.lines[0].timetables).toHaveLength(12);
    expect(service.lines.flatMap((line) => line.timetables).every((entry) => new URL(entry.url).hostname === "www.mlm.com.mo")).toBe(true);
  });
});
