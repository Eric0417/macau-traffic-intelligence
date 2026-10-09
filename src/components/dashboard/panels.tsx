"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BusFront,
  ChevronRight,
  CircleParking,
  Clock3,
  GraduationCap,
  MapPin,
  Send,
  Video,
  Waves,
  Wind,
} from "lucide-react";
import type { LiveJsonResult } from "@/components/use-live-json";
import { useLanguage } from "@/components/language-provider";
import { localized } from "@/lib/i18n";
import type {
  ApiEnvelope,
  BorderStatus,
  BridgeTime,
  BusEta,
  BusRoute,
  Camera,
  LrtNetwork,
  LrtNotice,
  LearningAssistantAnswer,
  LearningAssistantAction,
  ParkingFacility,
  RoadCollection,
  TrafficNotice,
  WeatherSnapshot,
} from "@/lib/types";

export interface PanelMetaProps {
  meta: ApiEnvelope<unknown>["meta"] | null;
}

function SourceNote({ meta }: PanelMetaProps) {
  const { t, locale } = useLanguage();
  if (!meta) return null;
  const time = new Date(meta.updatedAt).toLocaleTimeString(
    locale === "en" ? "en-GB" : "zh-MO",
    { hour: "2-digit", minute: "2-digit" },
  );

  return (
    <p className={`source-note ${meta.stale ? "is-stale" : ""}`}>
      {meta.stale ? <AlertTriangle size={13} aria-hidden="true" /> : null}
      <span>
        {t("updated")} {time}
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
          <p className="quiet-copy">{t("noWarnings")}</p>
        )}
      </section>

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
                    {Math.max(1, Math.round(bridge.runtimeSeconds / 60))} {t("minutes")}
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
              <strong>{counts[status]}</strong>
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
                  : t(border.status === "unknown" ? "unknown" : border.status === "clear" ? "normal" : "slow")}
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
          {!notices?.length ? <p className="quiet-copy">{t("noNotices")}</p> : null}
        </div>
      </section>
    </div>
  );
}

export function BusPanel({
  routes,
  selected,
  direction,
  eta,
  onSelect,
  onDirectionChange,
}: {
  routes: BusRoute[] | null;
  selected: BusRoute | null;
  direction: 0 | 1;
  eta: LiveJsonResult<BusEta>;
  onSelect: (route: BusRoute) => void;
  onDirectionChange: (direction: 0 | 1) => void;
}) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const detailRef = useRef<HTMLElement | null>(null);
  const scrolledRouteRef = useRef<string | null>(null);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (routes ?? []).filter(
      (route) => !needle || route.routeName.toLowerCase().includes(needle),
    );
  }, [query, routes]);

  const vehicles = eta.data?.vehicles ?? [];
  const vehicleByStation = new Map(vehicles.map((vehicle) => [vehicle.stationCode, vehicle]));

  useEffect(() => {
    if (!selected) {
      scrolledRouteRef.current = null;
      return;
    }
    if (scrolledRouteRef.current === selected.routeCode) return;
    if (selected.live && !eta.data && !eta.error) return;
    scrolledRouteRef.current = selected.routeCode;
    detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selected, eta.data, eta.error]);

  return (
    <div className="panel-stack">
      <section className="panel-section">
        <div className="section-heading">
          <h2>{t("bus")}</h2>
          <BusFront size={16} aria-hidden="true" />
        </div>
        <label className="search-field">
          <span className="sr-only">{t("searchRoute")}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchRoute")}
          />
        </label>
        <div className="route-grid">
          {filtered.map((route) => (
            <button
              type="button"
              key={route.routeCode}
              onClick={() => {
                onSelect(route);
              }}
              className={selected?.routeCode === route.routeCode ? "is-active" : ""}
              aria-pressed={selected?.routeCode === route.routeCode}
            >
              {route.routeName}
              {route.live ? null : <span className="route-flag">{t("seasonal")}</span>}
            </button>
          ))}
        </div>
      </section>

      {selected ? (
        <section className="panel-section" ref={detailRef}>
          <div className="route-detail-head">
            <div>
              <span>{t("route")}</span>
              <strong>{selected.routeName}</strong>
            </div>
            <div className="segmented" aria-label={t("direction")}>
              <button
                type="button"
                className={direction === 0 ? "is-active" : ""}
                onClick={() => onDirectionChange(0)}
              >
                {t("outbound")}
              </button>
              <button
                type="button"
                className={direction === 1 ? "is-active" : ""}
                onClick={() => onDirectionChange(1)}
              >
                {t("return")}
              </button>
            </div>
          </div>
          <SourceNote meta={eta.meta} />
          {eta.data && eta.data.diversion.suspendedStops.length > 0 ? (
            <p className="diversion-note">
              <AlertTriangle size={13} aria-hidden="true" />
              <span>
                {t("diversion")} · {t("suspendedStops")}：
                {eta.data.diversion.suspendedStops
                  .map((stop) => stop.stationName)
                  .join("、")}
              </span>
            </p>
          ) : null}
          {selected.live ? null : <p className="quiet-copy">{t("noLiveData")}</p>}
          {eta.loading ? <p className="quiet-copy">{t("loading")}</p> : null}
          {eta.error ? <p className="error-copy">{t("unavailable")}</p> : null}
          {vehicles.length > 0 ? (
            <div className="vehicle-list">
              <div className="section-heading">
                <h3>
                  {t("liveBuses")} <small>{vehicles.length}</small>
                </h3>
                <BusFront size={15} aria-hidden="true" />
              </div>
              {vehicles.map((vehicle) => (
                <article className="vehicle-row" key={vehicle.id}>
                  <strong>{vehicle.plate}</strong>
                  <span>
                    {t("approaching")} {vehicle.stationName}
                  </span>
                  <div>
                    {vehicle.lowFloor ? (
                      <em className="vehicle-tag">{t("lowFloor")}</em>
                    ) : null}
                    {vehicle.speedKph === null ? null : (
                      <em>
                        {t("speed")} {vehicle.speedKph} km/h
                      </em>
                    )}
                  </div>
                </article>
              ))}
              <p className="quiet-copy">{t("positionNote")}</p>
              <p className="quiet-copy">{t("modelNote")}</p>
            </div>
          ) : null}
          {eta.data ? <p className="quiet-copy">{t("routeTrafficNote")}</p> : null}
          <ol className="eta-list">
            {eta.data?.stops.map((stop) => (
              <li
                key={`${stop.stationCode}-${stop.sequence}`}
                className={stop.suspended ? "is-suspended" : ""}
              >
                <span className={`eta-sequence tone-${stop.trafficStatus}`}>
                  {stop.sequence + 1}
                </span>
                <span className="eta-station">
                  {stop.stationName}
                  {stop.suspended ? (
                    <em className="eta-suspended">{t("suspended")}</em>
                  ) : null}
                  {vehicleByStation.has(stop.stationCode) ? (
                    <em className="eta-bus">
                      {vehicleByStation.get(stop.stationCode)?.plate}
                    </em>
                  ) : null}
                </span>
                <strong>
                  {stop.etaMinutes === null ? (
                    "–"
                  ) : stop.etaMinutes === 0 ? (
                    <em className="eta-arriving">{t("arriving")}</em>
                  ) : (
                    <>
                      {stop.etaMinutes}
                      <small>{t("minutes")}</small>
                    </>
                  )}
                </strong>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <p className="quiet-copy panel-empty">{t("chooseRoute")}</p>
      )}
    </div>
  );
}

export function ParkingPanel({
  facilities,
  selectedId,
  onSelect,
}: {
  facilities: ParkingFacility[] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (facilities ?? [])
      .filter((facility) => !needle || facility.name.toLowerCase().includes(needle))
      .sort(
        (a, b) =>
          (b.availability.lightVehicle ?? -1) - (a.availability.lightVehicle ?? -1),
      )
      .slice(0, 80);
  }, [facilities, query]);

  return (
    <div className="panel-stack">
      <section className="panel-section">
        <div className="section-heading">
          <h2>{t("parking")}</h2>
          <CircleParking size={16} aria-hidden="true" />
        </div>
        <label className="search-field">
          <span className="sr-only">{t("parkingSearch")}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("parkingSearch")}
          />
        </label>
        <div className="parking-list">
          {filtered.map((facility) => {
            const availability = facility.availability.lightVehicle;
            const tone =
              availability === null
                ? "unknown"
                : availability <= 5
                  ? "low"
                  : availability <= 20
                    ? "medium"
                    : "good";
            return (
              <button
                type="button"
                className={`parking-row ${selectedId === facility.id ? "is-active" : ""} ${
                  facility.coordinates ? "" : "is-unmapped"
                }`}
                key={facility.id}
                onClick={() => onSelect(facility.id)}
                disabled={!facility.coordinates}
                aria-pressed={selectedId === facility.id}
              >
                <div>
                  <strong>{facility.name}</strong>
                  <span>
                    {facility.availability.motorcycle ?? "–"} {t("motorcycle")} ·{" "}
                    {facility.availability.electricVehicle ?? "–"} {t("electricVehicle")}
                    {facility.coordinates ? null : ` · ${t("noLocation")}`}
                  </span>
                </div>
                <div className={`parking-count tone-${tone}`}>
                  <strong>{availability ?? "–"}</strong>
                  <span>{t("lightVehicle")}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function NoticesPanel({
  notices,
  lrtNotices,
  selectedId,
  onSelect,
}: {
  notices: TrafficNotice[];
  lrtNotices: LrtNotice[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t, locale } = useLanguage();
  const incidents = notices.filter((notice) => notice.category === "incident");
  const others = notices.filter((notice) => notice.category !== "incident");

  const renderNotice = (notice: TrafficNotice) => (
    <article
      className={`notice-item ${selectedId === notice.id ? "is-active" : ""}`}
      key={notice.id}
    >
      <button
        type="button"
        className="notice-select"
        onClick={() => onSelect(notice.id)}
        aria-pressed={selectedId === notice.id}
      >
        <span className={`notice-type type-${notice.category}`}>
          {notice.category === "incident"
            ? t("incident")
            : notice.category === "roadworks"
              ? t("roads")
              : notice.category === "bus-change"
                ? t("bus")
                : t("notices")}
        </span>
        <strong>{notice.title}</strong>
        {notice.content === notice.title ? null : <p>{notice.content}</p>}
        {notice.publishedAt ? (
          <time>
            {new Date(notice.publishedAt).toLocaleString(
              locale === "en" ? "en-GB" : "zh-MO",
            )}
          </time>
        ) : null}
      </button>
      <a
        className="notice-link"
        href={notice.url}
        target="_blank"
        rel="noreferrer"
        aria-label={t("openSource")}
      >
        <ChevronRight size={15} aria-hidden="true" />
      </a>
    </article>
  );

  return (
    <div className="panel-stack">
      <section className="panel-section">
        <div className="section-heading">
          <h2>{t("incidents")}</h2>
          <AlertTriangle size={16} aria-hidden="true" />
        </div>
        <div className="notice-list">
          {incidents.map(renderNotice)}
          {!incidents.length ? <p className="quiet-copy">{t("noIncidents")}</p> : null}
        </div>
        {others.length ? (
          <details className="notice-more">
            <summary>
              {t("otherNotices")} ({others.length})
            </summary>
            <div className="notice-list">{others.map(renderNotice)}</div>
          </details>
        ) : null}
      </section>

      <section className="panel-section">
        <div className="section-heading">
          <h2>{t("lrtNotice")}</h2>
          <Waves size={16} aria-hidden="true" />
        </div>
        <p className="quiet-copy">{t("lrtNoLive")}</p>
        <p className="quiet-copy">{t("modelNote")}</p>
        <div className="notice-list">
          {lrtNotices.map((notice) => (
            <article key={notice.id}>
              <span className="notice-type type-lrt">{t("lrt")}</span>
              <strong>{notice.title}</strong>
              {notice.content === notice.title ? null : <p>{notice.content}</p>}
              <time>
                {new Date(notice.publishedAt).toLocaleString(locale === "en" ? "en-GB" : "zh-MO")}
              </time>
            </article>
          ))}
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
}: {
  network: LrtNetwork | null;
  notices: LrtNotice[];
  selectedLine: string | null;
  onSelectLine: (lineRef: string | null) => void;
}) {
  const { t, locale } = useLanguage();
  const lines = network?.lines.features ?? [];
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

        {selectedLine ? (
          <ol className="lrt-stations">
            {stations.map((station, index) => (
              <li key={station.id}>
                <span className="eta-sequence">{index + 1}</span>
                <span className="eta-station">{localized(station.name, locale)}</span>
                {station.interchange ? (
                  <em className="lrt-interchange">{t("interchange")}</em>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <section className="panel-section">
        <div className="section-heading">
          <h2>{t("lrtNotice")}</h2>
          <AlertTriangle size={16} aria-hidden="true" />
        </div>
        <div className="notice-list">
          {notices.slice(0, 5).map((notice) => (
            <article key={notice.id}>
              <span className="notice-type type-lrt">{t("lrt")}</span>
              <strong>{notice.title}</strong>
              {notice.content === notice.title ? null : <p>{notice.content}</p>}
              <time>
                {new Date(notice.publishedAt).toLocaleString(locale === "en" ? "en-GB" : "zh-MO")}
              </time>
            </article>
          ))}
          {!notices.length ? <p className="quiet-copy">{t("noNotices")}</p> : null}
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
}: {
  route: BusRoute | null;
  direction: 0 | 1;
  onAction?: (action: LearningAssistantAction | null) => void;
  onOpenTab?: (action: LearningAssistantAction) => void;
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
    }>
  >([]);
  const nextId = useRef(0);

  const ask = async (value: string) => {
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
        | { message?: string };
      if (!response.ok || !("data" in body)) {
        throw new Error("message" in body ? body.message : `HTTP ${response.status}`);
      }
      setEntries((current) =>
        current.map((entry) =>
          entry.id === id ? { ...entry, answer: body.data } : entry,
        ),
      );
      onAction?.(body.data.action ?? null);
    } catch {
      setEntries((current) =>
        current.map((entry) => (entry.id === id ? { ...entry, failed: true } : entry)),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel-stack">
      <section className="panel-section">
        <div className="section-heading">
          <h2>{t("assistant")}</h2>
          <GraduationCap size={16} aria-hidden="true" />
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
                        { hour: "2-digit", minute: "2-digit" },
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
                  <p className="error-copy">{t("assistantUnavailable")}</p>
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
