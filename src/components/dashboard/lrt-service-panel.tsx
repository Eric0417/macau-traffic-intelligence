"use client";

import { ExternalLink } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { useLiveJson } from "@/components/use-live-json";
import type { LrtService } from "@/lib/lrt-service";
import { SourceNote } from "./panels";

const copy = {
  "zh-Hant": { title: "官方班次與時刻表", note: "班表列出計劃出發時間，未接通即時到站資料。臨時調整以輕軌公司公告為準。", weekdays: "星期一至四", weekends: "星期五至日及公眾假期", timetable: "查看逐站官方時刻表", original: "官方原文", empty: "暫時未能讀取官方班次資料", retry: "重新載入" },
  "zh-Hans": { title: "官方班次与时刻表", note: "班表列出计划出发时间，未接通实时到站资料。临时调整以轻轨公司公告为准。", weekdays: "星期一至四", weekends: "星期五至日及公众假期", timetable: "查看逐站官方时刻表", original: "官方原文", empty: "暂时未能读取官方班次资料", retry: "重新载入" },
  en: { title: "Official service & timetables", note: "Scheduled departures, with no live arrival feed connected. Check MLM notices for temporary changes.", weekdays: "Monday–Thursday", weekends: "Friday–Sunday & public holidays", timetable: "Official station timetables", original: "Publisher text in Chinese", empty: "Official service data is unavailable", retry: "Retry" },
};

export function LrtServicePanel({ lineName }: { lineName?: string }) {
  const { locale, t } = useLanguage();
  const c = copy[locale];
  const service = useLiveJson<LrtService>("/api/v1/lrt/service", 21_600_000);
  const lines = service.data?.lines.filter((line) => !lineName || line.name === lineName) ?? [];
  return <section className="panel-section lrt-service">
    <div className="section-heading"><h2>{c.title}</h2><ExternalLink size={16} aria-hidden="true" /></div>
    <p className="quiet-copy">{c.note}</p>
    {service.loading && !service.data ? <p role="status">{t("loading")}</p> : null}
    {service.error ? <p className="data-warning" role="status">{c.empty} <button type="button" onClick={service.refresh}>{c.retry}</button></p> : null}
    {lines.map((line) => <div className="lrt-service-line" key={line.name}>
      <h3>{line.name}</h3>
      <p>{line.frequency} · {line.journeyTime}</p>
      <dl><div><dt>{c.weekdays}</dt><dd>{line.weekdayHours}</dd></div><div><dt>{c.weekends}</dt><dd>{line.weekendHours}</dd></div></dl>
      <details><summary>{c.timetable}</summary><div className="lrt-timetables">{line.timetables.map((entry) => <a key={entry.url} href={entry.url} target="_blank" rel="noreferrer">{entry.stationName}<ExternalLink size={13} aria-hidden="true" /></a>)}</div></details>
    </div>)}
    {service.data?.revisionNote ? <p className="quiet-copy">{c.original} · {service.data.revisionNote}</p> : null}
    <SourceNote meta={service.meta} />
  </section>;
}
