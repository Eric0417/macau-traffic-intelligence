"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import type { LiveJsonResult } from "@/components/use-live-json";
import { residentCopy } from "@/lib/resident-copy";
import type { OfficialNews, TrafficNotice } from "@/lib/types";
import { SourceNote } from "./panels";

export function NoticesPanel({
  notices,
  news,
  selectedId,
  onSelect,
}: {
  notices: LiveJsonResult<TrafficNotice[]>;
  news: LiveJsonResult<OfficialNews>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t, locale } = useLanguage();
  const c = residentCopy[locale];
  const [category, setCategory] = useState<"news" | "arrangements">("news");
  const rows = category === "news" ? news.data?.items : notices.data;
  const state = category === "news" ? news : notices;
  return (
    <div className="panel-stack">
      <section className="panel-section">
        <h2>{c.news}</h2>
        <p className="notice-explanation">{c.newsIntro}</p>
        <div className="segmented">
          <button
            type="button"
            className={category === "news" ? "is-active" : ""}
            aria-pressed={category === "news"}
            onClick={() => setCategory("news")}
          >
            {c.governmentNews}
          </button>
          <button
            type="button"
            className={category === "arrangements" ? "is-active" : ""}
            aria-pressed={category === "arrangements"}
            onClick={() => setCategory("arrangements")}
          >
            {c.arrangements}
          </button>
        </div>
        <SourceNote meta={state.meta} />
        {state.loading ? (
          <p className="loading-state" role="status">
            {t("loading")}
          </p>
        ) : null}
        {state.error ? (
          <div className="data-warning" role="status">
            {t("unavailable")}
            <button
              className="text-action"
              type="button"
              onClick={state.refresh}
            >
              {t("retry")}
            </button>
          </div>
        ) : null}
        {category === "news" &&
        news.data?.feeds.some((feed) => !feed.available) ? (
          <p className="data-warning">{c.incomplete}</p>
        ) : null}
        {category === "news" ? (
          <div className="feed-statuses">
            {news.data?.feeds.map((feed) => (
              <a
                key={feed.name}
                href={feed.url}
                target="_blank"
                rel="noreferrer"
              >
                {feed.name} · {feed.available ? c.fresh : t("unavailable")}
              </a>
            ))}
          </div>
        ) : null}
        <div className="published-list">
          {rows?.map((notice) => (
            <article
              key={notice.id}
              className={selectedId === notice.id ? "is-active" : ""}
            >
              <div className="eyebrow">
                {notice.id.startsWith("gcs:") ? "GCS" : "DSAT"} ·{" "}
                {notice.publishedAt
                  ? `${c.published} ${new Date(notice.publishedAt).toLocaleString(locale === "en" ? "en-GB" : "zh-MO", { timeZone: "Asia/Macau", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
                  : c.unknownTime}
              </div>
              <h3>{notice.title}</h3>
              {notice.content !== notice.title ? <p>{notice.content}</p> : null}
              <div className="notice-actions">
                <button
                  type="button"
                  className="text-action"
                  onClick={() => onSelect(notice.id)}
                  aria-pressed={selectedId === notice.id}
                >
                  {c.map}
                </button>
                <a href={notice.url} target="_blank" rel="noreferrer">
                  {t("openSource")}
                  <ArrowUpRight size={15} />
                </a>
              </div>
            </article>
          ))}
        </div>
        {rows && !rows.length ? (
          <p className="empty-state">{c.noPublished}</p>
        ) : null}
      </section>
    </div>
  );
}
