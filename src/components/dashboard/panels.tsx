"use client";

import { createPortal } from "react-dom";
import type { AssistantJourneyPlans, AssistantJourneyRequest, AssistantJourneyResult } from "@/lib/assistant-journey";
import { itineraryDraft, ItineraryPanel } from "./itinerary-panel";
import type { TripDraft } from "@/lib/itinerary";
import type { BusJourney } from "@/lib/bus-journey";
import type { SelectedJourney } from "./journey-map-detail";
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
import { VoiceInput } from "./voice-input";
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
  route, direction, onAction, onOpenTab, request, guideTarget, onShowGuide, onStart, onJourney, onManualBus, voiceView,
}: {
  guideTarget?: HTMLElement | null;
  onShowGuide?: () => void;
  onStart: () => void;
  onJourney: (journey: SelectedJourney) => void;
  onManualBus: () => void;
  voiceView?: "list" | "map";
  route: BusRoute | null;
  direction: 0 | 1;
  onAction?: (action: LearningAssistantAction | null) => void;
  onOpenTab?: (action: LearningAssistantAction) => void;
  request?: { id: number; question: string } | null;
}) {
  const { t, locale } = useLanguage();
  const label = (hant: string, hans: string, en: string) => locale === "en" ? en : locale === "zh-Hans" ? hans : hant;
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationFailed, setLocationFailed] = useState(false);
  const [originDraft, setOriginDraft] = useState("");
  const [pending, setPending] = useState<AssistantJourneyRequest | null>(null);
  const [activeTrip, setActiveTrip] = useState<TripDraft | undefined>();
  const [result, setResult] = useState<AssistantJourneyResult | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [entry, setEntry] = useState<{ question: string; answer?: LearningAssistantAnswer; failed?: boolean; unconfigured?: boolean } | null>(null);
  const requestedId = useRef<number | null>(null);
  const inFlight = useRef(false);

  const showOption = useCallback((plans: AssistantJourneyPlans, journey: BusJourney) => {
    setSelectedOption(journey.id);
    onJourney({ journey, origin: plans.origin.coordinates, destination: plans.destination.coordinates,
      destinationName: plans.destination.name, networkFetchedAt: plans.networkFetchedAt, walkingMappedAt: plans.walkingMappedAt });
  }, [onJourney]);

  const ask = useCallback(async (value: string, continuation?: AssistantJourneyRequest) => {
    const question = value.trim();
    if (question.length < 2 || inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setLocationFailed(false); setDraft(""); setResult(null); setSelectedOption(null);
    setEntry({ question }); onStart();
    let payload: AssistantJourneyRequest = continuation ?? { question, locale, previousTrip: activeTrip };
    setPending(payload);
    async function sendJourney() {
      const response = await fetch("/api/v1/assistant/journeys", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok || !body.data) throw new Error(body.error ?? "assistant_unavailable");
      return body.data as AssistantJourneyResult;
    }
    try {
      let data = await sendJourney();
      if (data.kind === "traffic") {
        setActiveTrip(undefined);
        const response = await fetch("/api/v1/assistant", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, locale, ...(route ? { focus: { routeCode: route.routeCode, direction } } : {}) }),
        });
        const body = await response.json();
        if (!response.ok || !body.data) throw new Error(body.error ?? "assistant_unavailable");
        setEntry({ question, answer: body.data }); onShowGuide?.(); onAction?.(body.data.action ?? null);
        return;
      }
      if (data.kind === "location" || data.kind === "trip-location" || data.kind === "nearby-location") {
        if (data.kind === "location") payload = { ...payload, destinationId: data.destination.id };
        if (data.kind === "trip-location") payload = { ...payload, trip: data.draft };
        if (data.kind === "trip-location") setActiveTrip(data.draft);
        setPending(payload); setResult(data); setLocating(true);
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            if (!navigator.geolocation) { reject(new Error("location_unavailable")); return; }
            navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 });
          });
          payload = { ...payload, origin: [position.coords.longitude, position.coords.latitude] };
        } catch {
          setLocationFailed(true);
          return;
        } finally { setLocating(false); }
        setPending(payload);
        data = await sendJourney();
      }
      if (data.kind === "nearby") {
        setActiveTrip(undefined); setResult(data);
        return;
      }
      setResult(data);
      if ("draft" in data) { setPending({ ...payload, trip: data.draft }); setActiveTrip(data.kind === "itineraries" ? itineraryDraft(data, data.options[0]) : data.draft); }
      else setActiveTrip(undefined);
      if (data.kind === "choose") setPending({ ...payload, ...(data.destination ? { destinationId: data.destination.id } : {}), ...(data.originQuery ? { originQuery: data.originQuery } : {}) });
      if (data.kind === "plans") showOption(data, data.options[0].journey);
    } catch (error) {
      setEntry({ question, failed: true, unconfigured: error instanceof Error && error.message === "assistant_unconfigured" });
      onShowGuide?.();
    } finally { setBusy(false); inFlight.current = false; }
  }, [locale, route, direction, onAction, onShowGuide, onStart, showOption, activeTrip]);

  useEffect(() => {
    if (!request || busy || requestedId.current === request.id) return;
    requestedId.current = request.id;
    void ask(request.question);
  }, [request, busy, ask]);

  return (
    <div className="panel-stack assistant-planning">
      <section className="panel-section">
        <div className="section-heading"><h2>{t("assistant")}</h2><Sparkles size={18} aria-hidden="true" /></div>
        <p className="quiet-copy">{t("assistantIntro")}</p>
        <form className="assistant-form" onSubmit={event => { event.preventDefault(); void ask(draft); }}>
          <label><span className="sr-only">{t("assistantPlaceholder")}</span><textarea value={draft} rows={2} maxLength={500} placeholder={t("assistantPlaceholder")} onChange={event => setDraft(event.target.value)} /></label>
          {voiceView ? <VoiceInput key={`${voiceView}:${busy}`} disabled={busy} onTranscript={text => setDraft(value => [value.trimEnd(), text].filter(Boolean).join(" ").slice(0, 500))} /> : null}
          <button type="submit" disabled={busy || draft.trim().length < 2}><Send size={15} aria-hidden="true" /><span>{t("assistantSend")}</span></button>
        </form>
        <p className="assistant-privacy">{t("assistantPrivacy")}</p>
        {busy ? <p className="assistant-progress" role="status">{locating ? label("正在取得目前位置…", "正在获取当前位置…", "Getting your location…") : label("正在理解要求及連接各段交通…", "正在理解要求并连接各段交通…", "Resolving places and connecting your journey…")}</p> : null}
        {!entry ? <div className="assistant-suggestions">{[label("由關閘搭巴士去媽閣廟", "从关闸坐巴士去妈阁庙", "Take a bus from Border Gate to A-Ma Temple"), label("由培正去澳門運動場，再去媽閣", "从培正去澳门运动场，再去妈阁", "From Pui Ching to Macau Stadium, then A-Ma Temple"), label("幫我安排傳統文化一日遊", "帮我安排传统文化一日游", "Plan a traditional culture day trip")].map(suggestion => <button type="button" key={suggestion} disabled={busy} onClick={() => void ask(suggestion)}>{suggestion}</button>)}</div> : null}
        {result?.kind === "choose" && pending ? <div className="assistant-place-choices">
          <p>{result.field === "origin" ? label("請揀出發地點", "请选择出发地点", "Choose your origin") : label("你想去邊一個地點？", "你想去哪个地点？", "Which destination do you mean?")}</p>
          {result.choices.map(place => <button type="button" key={place.id} disabled={busy} onClick={() => void ask(pending.question, { ...pending, [result.field === "origin" ? "originId" : "destinationId"]: place.id })}>{place.name}{place.nearbyStop ? ` · ${label("近", "近", "near")} ${place.nearbyStop}` : ""}</button>)}
        </div> : null}
        {result?.kind === "clarify" ? <p className="data-warning" role="status">{result.message}</p> : null}
        {(locationFailed || result?.kind === "clarify") && pending ? <div className="assistant-location-fallback">
          {locationFailed ? <p role="status">{label("未能取得位置。可以重試，或者輸入出發地點。", "未能获取位置。可以重试，或者输入出发地点。", "Location unavailable. Retry or enter your starting point.")}</p> : null}
          {locationFailed ? <button className="text-action" type="button" disabled={busy} onClick={() => void ask(pending.question, { ...pending, origin: undefined, originQuery: undefined, originId: undefined, trip: pending.trip ? { ...pending.trip, originQuery: undefined, originId: undefined } : undefined })}>{label("重試定位", "重试定位", "Retry location")}</button> : null}
          <form onSubmit={event => { event.preventDefault(); void ask(pending.question, { ...pending, origin: undefined, originQuery: originDraft, originId: undefined, trip: pending.trip ? { ...pending.trip, originQuery: originDraft, originId: undefined } : undefined }); }}>
            <label>{label("出發地點", "出发地点", "Starting point")}<input value={originDraft} maxLength={150} onChange={event => setOriginDraft(event.target.value)} /></label>
            <button className="primary-action" type="submit" disabled={busy || !originDraft.trim()}>{label("由呢度出發", "从这里出发", "Start here")}</button>
          </form>
        </div> : null}
        {entry?.failed ? <p className="error-copy" role="alert">{entry.unconfigured ? residentCopy[locale].aiNotEnabled : t("assistantUnavailable")}</p> : null}
        {entry?.answer ? <button type="button" className="text-action" onClick={onShowGuide}>{label("查看指引", "查看指引", "View guidance")}</button> : null}
        <button type="button" className="text-action assistant-manual-plan" disabled={busy} onClick={onManualBus}>{residentCopy[locale].manualBus}</button>
      </section>
      {result && "draft" in result ? <ItineraryPanel key={result.kind === "itineraries" ? result.generatedAt : JSON.stringify(result.draft)} result={result} busy={busy}
        onContinue={trip => { if (pending) void ask(pending.question, { ...pending, trip, previousTrip: undefined }); }}
        onJourney={onJourney} onSelect={setActiveTrip} onClearMap={onStart} /> : null}
      {result?.kind === "nearby" ? <section className="panel-section" aria-label={label("附近交通資訊", "附近交通信息", "Nearby transport information")}>
        <h2>{label("附近交通資訊", "附近交通信息", "Nearby transport information")}</h2>
        <p className="assistant-answer">{result.answer.answer}</p>
        <ul className="assistant-context">{result.answer.contextSummary.map(item => <li key={item}>{item}</li>)}</ul>
      </section> : null}
      {result?.kind === "plans" ? <section className="panel-section assistant-options" aria-label={label("AI 行程方案", "AI 行程方案", "AI journey options")}>
        <p className="eyebrow">{result.origin.name} → {result.destination.name}</p>
        <h2>{label("AI 幫你比較咗以下方案", "AI 帮你比较了以下方案", "Your AI journey options")}</h2>
        <p>{result.summary}</p>
        <p className="quiet-copy">{label("即時出發", "即刻出发", "Leave now")} · {new Date(result.generatedAt).toLocaleTimeString(locale === "en" ? "en-GB" : "zh-MO", { timeZone: "Asia/Macau", hour: "2-digit", minute: "2-digit" })}</p>
        {result.options.map(({ journey, title, reason }, index) => <button type="button" className="assistant-option" key={journey.id} aria-pressed={selectedOption === journey.id} onClick={() => showOption(result, journey)}>
          <span className="eyebrow">{!journey.legs.length && journey.accessMeters >= 3_000 && result.taxiAlternative
            ? label("長距離步行備選", "长距离步行备选", "Long walking alternative")
            : index === 0 ? label("AI 推薦", "AI 推荐", "AI recommendation") : label("另一方案", "另一方案", "Alternative")} {index + 1}</span>
          <strong>{title}</strong><span>{journey.legs.length ? journey.legs.map(l => `${l.routeName} → ${l.to.stationName}`).join(" · ") : label("全程步行", "全程步行", "Walk all the way")}</span>
          <span>{reason}</span>
          <small>{label("接駁距離約", "接驳距离约", "Access distance about")} {journey.accessMeters + journey.egressMeters + journey.transferMeters} m{journey.legs.length ? ` · ${journey.totalStops} ${label("個站", "个站", "stops")}` : ""} · {label("查看地圖及步驟", "查看地图及步骤", "Map & steps")}</small>
        </button>)}
        {result.taxiAlternative ? <div className="trip-recommendation"><h3>{label("的士備選", "的士备选", "Taxi alternative")}</h3><p>{result.taxiAlternative}</p></div> : null}
        {result.warnings.map(w => <p className="quiet-copy" key={w}>{w}</p>)}
        <p className="quiet-copy">{label("路線資料", "路线资料", "Route data")} {result.networkFetchedAt.slice(0, 10)} · {label("步行資料", "步行资料", "Walking data")} {result.walkingMappedAt.slice(0, 10)}</p>
      </section> : null}
      {guideTarget && entry && (entry.answer || entry.failed) ? createPortal(<div className="assistant-brief" aria-live="polite"><article className="assistant-entry">
        <p className="assistant-question">{entry.question}</p>
        {entry.answer ? <><p className="assistant-answer">{entry.answer.answer}</p><p className="assistant-note">{t("assistantBasedOn")} {new Date(entry.answer.snapshotAt).toLocaleTimeString(locale === "en" ? "en-GB" : "zh-MO", { timeZone: "Asia/Macau", hour: "2-digit", minute: "2-digit" })}</p><ul className="assistant-context">{entry.answer.contextSummary.map(item => <li key={item}>{item}</li>)}</ul>
          {entry.answer.action && onOpenTab ? <button type="button" className="assistant-action" onClick={() => onOpenTab(entry.answer!.action!)}>{entry.answer.action.kind === "bus" ? t("assistantOpenBus") : t("assistantOpenLrt")}</button> : null}</> : <p className="error-copy">{entry.unconfigured ? residentCopy[locale].aiNotEnabled : t("assistantUnavailable")}</p>}
      </article></div>, guideTarget) : null}
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
