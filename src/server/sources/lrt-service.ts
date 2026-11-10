import "server-only";
import { load } from "cheerio";
import { lrtServiceSchema, type LrtService } from "@/lib/lrt-service";
import { fetchText } from "@/server/http";
import type { SourceDefinition } from "@/server/source";

const ROUTE_PAGE = "https://www.mlm.com.mo/tc/route.html";

export function parseLrtService(html: string): LrtService {
  const $ = load(html);
  const lines: LrtService["lines"] = [];
  // Scope to the current service tab. The same page retains obsolete 2020 copy.
  $("#content1 > div").each((_, element) => {
    const name = $(element).children("span").first().text().trim();
    if (!["氹仔線", "石排灣線", "橫琴線"].includes(name)) return;
    const values = $(element).find(".tab-flex").map((_, row) =>
      $(row).children("span").last().text().trim(),
    ).get();
    const menu = $("#content2 .routeItem4").filter((_, row) =>
      $(row).children(".routeName").text().trim() === name,
    );
    const timetables: LrtService["lines"][number]["timetables"] = [];
    menu.find("a[data-image]").each((_, link) => {
      const path = $(link).attr("data-image") ?? "";
      // The publisher hosts these images locally; never pass arbitrary page URLs.
      if (!/^\/images\/stations\/TimeTable\/[\w/.-]+\.(jpg|png)$/i.test(path) || path.includes("..")) return;
      timetables.push({
        stationName: $(link).attr("data-title")?.trim() || $(link).text().trim(),
        url: new URL(path, ROUTE_PAGE).href,
      });
    });
    lines.push({ name, weekdayHours: values[0], weekendHours: values[1], frequency: values[2], journeyTime: values[3], timetables });
  });
  const revisionNote = $("#content2").text().match(/[^。\n]*時刻表更新於[^。\n]*。?/)?.[0]?.trim() ?? "";
  return lrtServiceSchema.parse({ lines, revisionNote });
}

export const lrtServiceSource: SourceDefinition<LrtService> = {
  id: "lrt-service",
  name: "澳門輕軌服務時間及官方時刻表",
  url: ROUTE_PAGE,
  attribution: "澳門輕軌股份有限公司官方服務資料；班表並非即時到站預報",
  envKey: "SOURCE_LRT_ENABLED",
  ttlSeconds: 21_600,
  staleTtlSeconds: 86_400,
  schema: lrtServiceSchema,
  load: async () => parseLrtService(await fetchText(ROUTE_PAGE)),
};
