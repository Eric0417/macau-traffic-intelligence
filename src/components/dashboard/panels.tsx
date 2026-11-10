"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Clock3,
  Sparkles,
  MapPin,
  Send,
  Video,
  Waves,
  Wind,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { localized } from "@/lib/i18n";
import { metaIsDelayed } from "@/lib/live-status";
import { residentCopy } from "@/lib/resident-copy";
import { LrtServicePanel } from "./lrt-service-panel";
import type {
  ApiEnvelope,
  BorderStatus,
  BridgeTime,
  BusRoute,
  Camera,
  LrtNetwork,
  LrtNotice,
  LearningAssistantAnswer,
  LearningAssistantAction,
  RoadCollection,
  TrafficNotice,
  WeatherSnapshot,
} from "@/lib/types";

export interface PanelMetaProps {
  meta: ApiEnvelope<unknown>["meta"] | null;
}

export function SourceNote({ meta }: PanelMetaProps) {
  const { t, locale } = useLanguage();
  if (!meta) return null;
  const delayed = metaIsDelayed(meta);
  const time = new Date(meta.updatedAt).toLocaleTimeString(
    locale === "en" ? "en-GB" : "zh-MO",
    { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Macau" },
  );

  return (
    <p className={`source-note ${delayed ? "is-stale" : ""}`}>
      {delayed ? <AlertTriangle size={13} aria-hidden="true" /> : null}
      <span>
        {residentCopy[locale].retrieved} {time}{delayed ? ` · ${t("stale")}` : ""}
      </span>
      <a href={meta.source.url} target="_blank" rel="noreferrer">
        {meta.source.name}
      </a>
    </p>
  );
}

function statusLabel(
  status: "normal" | "slow" | "congested" | "unknown",
  t: ReturnType<typeof useLanguage>["t"],
) {
  return t(status);
}

export function OverviewPanel({
  roads,
  bridges,
  weather,
  borders,
  notices,
  roadsMeta,
  bridgesMeta,
  weatherMeta,
  bordersMeta,
}: {
  roads: RoadCollection | null;
  bridges: BridgeTime[] | null;
  weather: WeatherSnapshot | null;
  borders: BorderStatus[] | null;
  notices: TrafficNotice[] | null;
  roadsMeta: PanelMetaProps["meta"];
  bridgesMeta: PanelMetaProps["meta"];
  weatherMeta: PanelMetaProps["meta"];
  bordersMeta: PanelMetaProps["meta"];
}) {
  const { t, locale } = useLanguage();
  const counts = useMemo(() => {
    const result = { normal: 0, slow: 0, congested: 0, unknown: 0 };
    roads?.features.forEach((feature) => {
      result[feature.properties.status] += 1;
    });
    return result;
  }, [roads]);

  const groupedBridges = useMemo(() => {
    const groups = new Map<string, BridgeTime[]>();
    bridges?.forEach((bridge) => {
      const key = bridge.name["zh-Hant"];
      groups.set(key, [...(groups.get(key) ?? []), bridge]);
    });
    return [...groups.values()];
  }, [bridges]);

  return (
    <div className="panel-stack">
      <section className="panel-section">
        <div className="section-heading">
          <h2>{t("weather")}</h2>
          <SourceNote meta={weatherMeta} />
        </div>
        <div className="weather-line">
          <strong>{weather?.temperatureCelsius ?? "--"}°</strong>
          <span>{t("humidity")} {weather?.humidityPercent ?? "--"}%</span>
          <span className="weather-wind">
            <Wind size={14} aria-hidden="true" />
            {weather?.wind?.replace(/^風向:\s*/, "").split(";")[0] ?? "--"}
          </span>
        </div>
        {weather?.warnings.some((warning) => warning.active) ? (
          weather.warnings
            .filter((warning) => warning.active)
            .map((warning) => (
              <div className="warning-row" key={warning.type}>
                <AlertTriangle size={16} aria-hidden="true" />
                <span>{warning.type}</span>
                <strong>{warning.text}</strong>
              </div>
            ))
        ) : (
          <p className="quiet-copy">{weather ? t("noWarnings") : residentCopy[locale].weatherEmpty}</p>
        )}
      </section>

      {weather?.forecast ? <section className="panel-section"><h2>{residentCopy[locale].forecast}</h2><p className="forecast-copy">{weather.forecast}</p></section> : null}

      <section className="panel-section">
        <div className="section-heading">
          <h2>{t("bridges")}</h2>
          <SourceNote meta={bridgesMeta} />
        </div>
        <div className="bridge-list">
          {groupedBridges.map((group) => (
            <div className="bridge-row" key={group[0].id.split("-")[0]}>
              <strong>{localized(group[0].name, locale)}</strong>
              <div className="bridge-directions">
                {group.map((bridge) => (
                  <span key={bridge.id}>
                    {bridge.direction === "northbound" ? (
                      <ArrowUp size={13} aria-hidden="true" />
                    ) : (
                      <ArrowDown size={13} aria-hidden="true" />
                    )}
                    {Math.round(bridge.runtimeSeconds / 60)} {t("minutes")}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel-section">
        <div className="section-heading">
          <h2>{t("trafficSummary")}</h2>
          <SourceNote meta={roadsMeta} />
        </div>
        <div className="status-grid">
          {(["normal", "slow", "congested", "unknown"] as const).map((status) => (
            <div className={`traffic-stat status-${status}`} key={status}>
              <span>{statusLabel(status, t)}</span>
              <strong>{roads ? counts[status] : "–"}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="panel-section">
        <div className="section-heading">
          <h2>{t("border")}</h2>
          <SourceNote meta={bordersMeta} />
        </div>
        <div className="compact-list">
          {borders?.map((border) => (
            <a
              href={border.sourceUrl}
              target="_blank"
              rel="noreferrer"
              key={border.id}
              className="compact-row"
            >
              <span>{localized(border.name, locale)}</span>
              <strong>
                {border.estimatedWaitMinutes !== null
                  ? `${border.estimatedWaitMinutes} ${t("minutes")}`
                  : (border.status === "unknown" ? t("unknown") : border.status === "clear" ? t("normal") : border.status === "closed" ? residentCopy[locale].closed : border.status === "very_busy" ? residentCopy[locale].veryBusy : residentCopy[locale].busy)}
              </strong>
            </a>
          ))}
          {!borders?.length ? <p className="quiet-copy">{t("unavailable")}</p> : null}
        </div>
      </section>

      <section className="panel-section">
        <div className="section-heading">
          <h2>{t("latestNotices")}</h2>
          <Clock3 size={15} aria-hidden="true" />
        </div>
        <div className="compact-list">
          {notices?.slice(0, 4).map((notice) => (
            <a href={notice.url} target="_blank" rel="noreferrer" className="notice-row" key={notice.id}>
              <span className={`notice-type type-${notice.category}`}>
                {notice.category === "roadworks"
                  ? t("roads")
                  : notice.category === "bus-change"
                    ? t("bus")
                    : t("notices")}
              </span>
              <span className="notice-title">{notice.title}</span>
              <ChevronRight size={15} aria-hidden="true" />
            </a>
          ))}
          {!notices?.length ? <p className="quiet-copy">{notices ? residentCopy[locale].noPublished : t("loading")}</p> : null}
        </div>
      </section>
    </div>
  );
}

export function LrtPanel({
  network,
  notices,
  selectedLine,
  onSelectLine,
  selectedStation,
  onSelectStation,
}: {
  network: LrtNetwork | null;
  notices: LrtNotice[];
  selectedLine: string | null;
  onSelectLine: (lineRef: string | null) => void;
  selectedStation: string | null;
  onSelectStation: (id: string) => void;
}) {
  const { t, locale } = useLanguage();
  const lines = network?.lines.features ?? [];
  const publishedNotices = notices.filter((notice) => notice.active);
  const historicalNotices = notices.filter((notice) => !notice.active);
  const stations = (network?.stations ?? []).filter((station) =>
    selectedLine ? station.lines.includes(selectedLine) : false,
  );

  return (
    <div className="panel-stack">
      <section className="panel-section">
        <div className="section-heading">
          <h2>{t("lrt")}</h2>
          <Waves size={16} aria-hidden="true" />
        </div>
        <div className="lrt-lines">
          {lines.map((line) => {
            const ref = line.properties.ref;
            const isActive = selectedLine === ref;
            const stationCount = (network?.stations ?? []).filter((station) =>
              station.lines.includes(ref),
            ).length;

            return (
              <button
                type="button"
                key={ref}
                className={isActive ? "is-active" : ""}
                aria-pressed={isActive}
                onClick={() => onSelectLine(isActive ? null : ref)}
              >
                <span className="lrt-swatch" style={{ background: line.properties.color }} />
                <span>
                  <strong>{localized(line.properties.name, locale)}</strong>
                  <small>
                    {stationCount} {t("stops")}
                  </small>
                </span>
              </button>
            );
          })}
          {!network ? <p className="quiet-copy">{t("loading")}</p> : null}
        </div>
        <p className="quiet-copy">{t("lrtNoLive")}</p>
        <p className="quiet-copy">{residentCopy[locale].lrtGeometry}</p>

        {selectedLine ? (
          <ol className="lrt-stations">
            {stations.map((station) => (
              <li key={station.id}><button type="button" className="lrt-station-button" aria-pressed={selectedStation === station.id} onClick={() => onSelectStation(station.id)}>
                <span className="eta-sequence"><MapPin size={14} aria-hidden="true" /></span>
                <span className="eta-station">{localized(station.name, locale)}</span>
                {station.interchange ? (
                  <em className="lrt-interchange">{t("interchange")}</em>
                ) : null}
              </button></li>
            ))}
          </ol>
        ) : null}
      </section>

      <LrtServicePanel lineName={lines.find((line) => line.properties.ref === selectedLine)?.properties.name["zh-Hant"]} />
      <section className="panel-section">
        <div className="section-heading">
          <h2>{t("lrtNotice")}</h2>
          <AlertTriangle size={16} aria-hidden="true" />
        </div>
        <div className="notice-list">
          {publishedNotices.slice(0, 5).map((notice) => (
            <article key={notice.id}>
              <span className="notice-type type-lrt">{t("lrt")}</span>
              <strong>{notice.title}</strong>
              {notice.content === notice.title ? null : <p>{notice.content}</p>}
              <time>
                {new Date(notice.publishedAt).toLocaleString(locale === "en" ? "en-GB" : "zh-MO", { timeZone: "Asia/Macau" })}
              </time>
            </article>
          ))}
          {!publishedNotices.length ? <p className="quiet-copy">{residentCopy[locale].noPublished}</p> : null}
          <p className="quiet-copy">{residentCopy[locale].lrtPublicationNote}</p>
          {historicalNotices.length ? <details className="historical-notices"><summary>{residentCopy[locale].historicalNotices} ({historicalNotices.length})</summary>{historicalNotices.map((notice) => <article key={notice.id}><time>{new Date(notice.publishedAt).toLocaleString(locale === "en" ? "en-GB" : "zh-MO", { timeZone: "Asia/Macau" })}</time><strong>{notice.title}</strong><p>{notice.content}</p></article>)}</details> : null}
        </div>
      </section>
    </div>
  );
}

export function AssistantPanel({
  route,
  direction,
  onAction,
  onOpenTab,
  request,
}: {
  route: BusRoute | null;
  direction: 0 | 1;
  onAction?: (action: LearningAssistantAction | null) => void;
  onOpenTab?: (action: LearningAssistantAction) => void;
  request?: { id: number; question: string } | null;
}) {
  const { t, locale } = useLanguage();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState<
    Array<{
      id: number;
      question: string;
      answer?: LearningAssistantAnswer;
      failed?: boolean;
      unconfigured?: boolean;
    }>
  >([]);
  const nextId = useRef(0);
  const requestedId = useRef<number | null>(null);

  const ask = useCallback(async (value: string) => {
    const question = value.trim();
    if (!question || busy) return;

    const id = (nextId.current += 1);
    setBusy(true);
    setDraft("");
    setEntries((current) => [...current, { id, question }]);

    try {
      const response = await fetch("/api/v1/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          locale,
          ...(route ? { focus: { routeCode: route.routeCode, direction } } : {}),
        }),
      });
      const body = (await response.json()) as
        | ApiEnvelope<LearningAssistantAnswer>
        | { message?: string; error?: string };
      if (!response.ok || !("data" in body)) {
        throw new Error("error" in body ? body.error : `HTTP ${response.status}`);
      }
      setEntries((current) =>
        current.map((entry) =>
          entry.id === id ? { ...entry, answer: body.data } : entry,
        ),
      );
      onAction?.(body.data.action ?? null);
    } catch (error) {
      setEntries((current) =>
        current.map((entry) => (entry.id === id ? { ...entry, failed: true, unconfigured: error instanceof Error && error.message === "assistant_unconfigured" } : entry)),
      );
    } finally {
      setBusy(false);
    }
  }, [busy, locale, route, direction, onAction]);

  useEffect(() => {
    if (!request || busy || requestedId.current === request.id) return;
    requestedId.current = request.id;
    void ask(request.question);
  }, [request, busy, ask]);

  return (
    <div className="panel-stack">
      <section className="panel-section">
        <div className="section-heading">
          <h2>{t("assistant")}</h2>
          <Sparkles size={18} aria-hidden="true" />
        </div>
        <p className="quiet-copy">{t("assistantIntro")}</p>
        {route ? (
          <p className="assistant-focus">
            {t("bus")} {route.routeName} ·{" "}
            {direction === 0 ? t("outbound") : t("return")}
          </p>
        ) : null}

        {entries.length ? (
          <div className="assistant-thread">
            {entries.map((entry) => (
              <article className="assistant-entry" key={entry.id}>
                <p className="assistant-question">{entry.question}</p>
                {entry.answer ? (
                  <>
                    <p className="assistant-answer">{entry.answer.answer}</p>
                    <p className="assistant-note">
                      {t("assistantBasedOn")}{" "}
                      {new Date(entry.answer.snapshotAt).toLocaleTimeString(
                        locale === "en" ? "en-GB" : "zh-MO",
                        { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Macau" },
                      )}
                    </p>
                    <ul className="assistant-context">
                      {entry.answer.contextSummary.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                    {entry.answer.action && onOpenTab ? (
                      <button
                        type="button"
                        className="assistant-action"
                        onClick={() => {
                          const action = entry.answer?.action;
                          if (action) onOpenTab(action);
                        }}
                      >
                        {entry.answer.action.kind === "bus"
                          ? t("assistantOpenBus")
                          : t("assistantOpenLrt")}
                      </button>
                    ) : null}
                  </>
                ) : entry.failed ? (
                  <p className="error-copy">{entry.unconfigured ? residentCopy[locale].aiNotEnabled : t("assistantUnavailable")}</p>
                ) : (
                  <p className="quiet-copy">{t("assistantThinking")}</p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="assistant-suggestions">
            <p className="quiet-copy">{t("assistantSuggested")}</p>
            {[t("assistantQ1"), t("assistantQ2"), t("assistantQ3")].map(
              (suggestion) => (
                <button
                  type="button"
                  key={suggestion}
                  disabled={busy}
                  onClick={() => void ask(suggestion)}
                >
                  {suggestion}
                </button>
              ),
            )}
          </div>
        )}

        <form
          className="assistant-form"
          onSubmit={(event) => {
            event.preventDefault();
            void ask(draft);
          }}
        >
          <label>
            <span className="sr-only">{t("assistantPlaceholder")}</span>
            <textarea
              value={draft}
              rows={2}
              maxLength={500}
              placeholder={t("assistantPlaceholder")}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          <button type="submit" disabled={busy || !draft.trim()}>
            <Send size={15} aria-hidden="true" />
            <span>{t("assistantSend")}</span>
          </button>
        </form>
        <p className="assistant-privacy">{t("assistantPrivacy")}</p>
      </section>
    </div>
  );
}

export function CameraPanel({
  cameras,
  selectedId,
  onSelect,
}: {
  cameras: Camera[] | null;
  selectedId: string | null;
  onSelect: (camera: Camera) => void;
}) {
  const { t, locale } = useLanguage();
  const [zone, setZone] = useState("all");
  const zones = useMemo(
    () => [...new Set((cameras ?? []).map((camera) => camera.zone["zh-Hant"]))],
    [cameras],
  );
  const filtered = (cameras ?? []).filter(
    (camera) => zone === "all" || camera.zone["zh-Hant"] === zone,
  );

  return (
    <div className="panel-stack">
      <section className="panel-section">
        <div className="section-heading">
          <h2>{t("cameras")}</h2>
          <Video size={16} aria-hidden="true" />
        </div>
        <div className="zone-tabs">
          <button
            type="button"
            className={zone === "all" ? "is-active" : ""}
            onClick={() => setZone("all")}
          >
            {t("all")}
          </button>
          {zones.map((item) => (
            <button
              type="button"
              className={zone === item ? "is-active" : ""}
              onClick={() => setZone(item)}
              key={item}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="camera-list">
          {filtered.map((camera) => (
            <button
              type="button"
              className={selectedId === camera.id ? "is-active" : ""}
              onClick={() => onSelect(camera)}
              aria-pressed={selectedId === camera.id}
              key={camera.id}
            >
              <MapPin size={15} aria-hidden="true" />
              <span>{localized(camera.name, locale)}</span>
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
