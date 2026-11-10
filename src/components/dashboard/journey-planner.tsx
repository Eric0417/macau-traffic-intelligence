"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowRight, LocateFixed, Route } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { useLiveJson } from "@/components/use-live-json";
import { planBusJourneys, searchBusStops, type BusNetwork, type BusJourney } from "@/lib/bus-journey";
import type { Coordinates } from "@/lib/resident-tools";
import { SourceNote } from "./panels";

const copy = {
  "zh-Hant": {
    title: "今次想去邊？", intro: "由你附近，搵直達或一次轉乘嘅巴士。", origin: "起點", destination: "終點", placeholder: "搜尋站名或站號", current: "使用目前位置", locating: "正在定位…", here: "目前位置", search: "尋找巴士方案", choose: "請從建議清單選擇起點及終點。", empty: "未找到符合條件的直達或一次轉乘方案。定位搜尋範圍為附近 500 米，可改選另一個站點。", direct: "直達", transfer: "轉乘一次", stops: "站", inspect: "查看到站與停站狀態", access: "到上車站直線距離", egress: "下車站到終點直線距離", note: "按轉乘較少、接駁距離較短、站數較少排列。距離為直線估算，未計步行路徑、班次時間或臨時改道；出發前請查看每段路線的到站與停站狀態。", privacy: "定位只在此瀏覽器內計算。終點請選附近巴士站。", dated: "路網取得日期", partial: "部分路線未收錄，方案可能不完整。", loading: "正在讀取官方站序…", unavailable: "暫時未能讀取路網", retry: "重試", chosen: "已選", results: "巴士方案", transferAt: "同站轉乘", same: "起點與終點相同，請選另一個站點。", notLive: "目前路線清單未提供即時查詢", unknownStop: "請選擇搜尋建議中的站點。",
  },
  "zh-Hans": {
    title: "这次想去哪？", intro: "从你附近，找直达或一次转乘的巴士。", origin: "起点", destination: "终点", placeholder: "搜索站名或站号", current: "使用目前位置", locating: "正在定位…", here: "目前位置", search: "寻找巴士方案", choose: "请从建议清单选择起点及终点。", empty: "未找到符合条件的直达或一次转乘方案。定位搜索范围为附近 500 米，可改选另一个站点。", direct: "直达", transfer: "转乘一次", stops: "站", inspect: "查看到站与停站状态", access: "到上车站直线距离", egress: "下车站到终点直线距离", note: "按转乘较少、接驳距离较短、站数较少排列。距离为直线估算，未计步行路径、班次时间或临时改道；出发前请查看每段路线的到站与停站状态。", privacy: "定位只在此浏览器内计算。终点请选择附近巴士站。", dated: "路网取得日期", partial: "部分路线未收录，方案可能不完整。", loading: "正在读取官方站序…", unavailable: "暂时未能读取路网", retry: "重试", chosen: "已选", results: "巴士方案", transferAt: "同站转乘", same: "起点与终点相同，请选另一个站点。", notLive: "目前路线清单未提供实时查询", unknownStop: "请选择搜索建议中的站点。",
  },
  en: {
    title: "Where are you going?", intro: "Find a direct bus or one transfer from nearby.", origin: "From", destination: "To", placeholder: "Search stop name or code", current: "Use my location", locating: "Locating…", here: "Current location", search: "Find bus options", choose: "Select your origin and destination from the suggestions.", empty: "No direct or one-transfer option found. Location searches use stops within 500 m; try another stop.", direct: "Direct", transfer: "One transfer", stops: "stops", inspect: "Check arrivals & stop status", access: "Straight-line distance to boarding stop", egress: "Straight-line distance from final stop", note: "Sorted by fewer transfers, shorter access distance, then fewer stops. Distances are straight-line estimates. Walking paths, service hours and diversions are not included; check each leg before leaving.", privacy: "Location stays in this browser. Choose a bus stop near your destination.", dated: "Network retrieved", partial: "Some routes are missing; options may be incomplete.", loading: "Loading official stop sequences…", unavailable: "The route network is unavailable", retry: "Retry", chosen: "Selected", results: "Bus options", transferAt: "Transfer at the same stop", same: "Origin and destination are the same. Choose another stop.", notLive: "Live lookup is not available in the current route list", unknownStop: "Choose a stop from the search suggestions.",
  },
};

type StopChoice = ReturnType<typeof searchBusStops>[number];

function PlaceField({ label, network, value, selected, onChange, onSelect, placeholder, chosen }: {
  label: string; network: BusNetwork | null; value: string; selected: StopChoice | null;
  onChange: (value: string) => void; onSelect: (stop: StopChoice) => void; placeholder: string; chosen: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => network && value.trim() && !selected ? searchBusStops(network, value).slice(0, 6) : [], [network, value, selected]);
  return <div className="journey-place">
    <label htmlFor={id}>{label}</label>
    <input ref={inputRef} id={id} type="search" value={value} aria-describedby={selected ? `${id}-selected` : undefined} autoComplete="off" placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    {selected ? <small id={`${id}-selected`}>{chosen} · {selected.stationCode}</small> : null}
    {matches.length ? <ul className="journey-suggestions" aria-label={label}>{matches.map((stop) => <li key={stop.stationCode}><button type="button" onClick={() => { onSelect(stop); inputRef.current?.focus(); }}><span>{stop.stationName}</span><small>{stop.stationCode}</small></button></li>)}</ul> : null}
  </div>;
}

export function JourneyPlanner({ enabled, location, locating, locationError, onLocate, onInspect, liveRouteCodes }: {
  enabled: boolean; location: Coordinates | null; locating: boolean; locationError: boolean; onLocate: () => void;
  onInspect: (leg: BusJourney["legs"][number]) => void; liveRouteCodes: Set<string>;
}) {
  const { locale } = useLanguage();
  const c = copy[locale];
  const network = useLiveJson<BusNetwork>("/api/v1/bus/network", 21_600_000, enabled);
  const [originText, setOriginText] = useState("");
  const [destinationText, setDestinationText] = useState("");
  const [origin, setOrigin] = useState<StopChoice | null>(null);
  const [destination, setDestination] = useState<StopChoice | null>(null);
  const [useLocation, setUseLocation] = useState(false);
  const [result, setResult] = useState<{ key: string; journeys: BusJourney[] } | null>(null);
  const resultKey = `${network.data?.fetchedAt}:${useLocation ? location?.join(",") : origin?.stationCode}:${destination?.stationCode}`;
  const journeys = result?.key === resultKey ? result.journeys : null;
  const [message, setMessage] = useState<string | null>(null);
  const clearResults = () => { setResult(null); setMessage(null); };
  return <section className="journey-planner" aria-labelledby="journey-title">
    <div className="section-heading"><h2 id="journey-title">{c.title}</h2><Route size={20} aria-hidden="true" /></div>
    <p className="quiet-copy">{c.intro}</p>
    <form onSubmit={(event) => {
      event.preventDefault();
      if (!network.data || !destination || (!useLocation && !origin) || (useLocation && (!location || locating || locationError))) { setMessage(c.choose); return; }
      if (!useLocation && origin?.stationCode === destination.stationCode) { setMessage(c.same); setResult(null); return; }
      setMessage(null);
      setResult({ key: resultKey, journeys: planBusJourneys(network.data, useLocation ? { coordinates: location! } : { stationCode: origin!.stationCode }, { stationCode: destination.stationCode }) });
    }}>
      <div className="journey-fields">
        {useLocation ? <div className="journey-place"><span>{c.origin}</span><p className="journey-current"><LocateFixed size={16} aria-hidden="true" />{locating ? c.locating : c.here}</p><button className="text-action" type="button" onClick={() => { setUseLocation(false); clearResults(); }}>{c.placeholder}</button></div> : <PlaceField label={c.origin} network={network.data} value={originText} selected={origin} placeholder={c.placeholder} chosen={c.chosen} onChange={(value) => { setOriginText(value); setOrigin(null); clearResults(); }} onSelect={(stop) => { setOrigin(stop); setOriginText(stop.stationName); clearResults(); }} />}
        <ArrowDown size={16} className="journey-direction" aria-hidden="true" />
        <PlaceField label={c.destination} network={network.data} value={destinationText} selected={destination} placeholder={c.placeholder} chosen={c.chosen} onChange={(value) => { setDestinationText(value); setDestination(null); clearResults(); }} onSelect={(stop) => { setDestination(stop); setDestinationText(stop.stationName); clearResults(); }} />
      </div>
      <div className="journey-actions"><button type="button" className="text-action" disabled={locating} onClick={() => { setUseLocation(true); clearResults(); onLocate(); }}><LocateFixed size={15} aria-hidden="true" />{locating ? c.locating : c.current}</button><button type="submit" className="journey-submit" disabled={!network.data || locating}>{c.search}<ArrowRight size={16} aria-hidden="true" /></button></div>
    </form>
    <p className="quiet-copy">{c.privacy}</p>
    {network.loading && !network.data ? <p role="status">{c.loading}</p> : null}
    {network.error ? <p className="data-warning" role="status">{c.unavailable} <button type="button" onClick={network.refresh}>{c.retry}</button></p> : null}
    {message ? <p className="data-warning" role="status">{message}</p> : null}
    {network.data?.coverage.missingRoutes.length ? <p className="data-warning">{c.partial} {network.data.coverage.loadedRoutes}/{network.data.coverage.catalogRoutes}</p> : null}
    {journeys ? <div className="journey-results" aria-live="polite"><h3>{c.results} · {journeys.length}</h3>
      {!journeys.length ? <p>{c.empty}</p> : null}
      {journeys.map((journey) => <article className="journey-option" key={journey.id}>
        <header><strong>{journey.legs.length === 1 ? c.direct : c.transfer}</strong><span>{journey.totalStops} {c.stops}</span></header>
        {journey.accessMeters > 0 ? <p className="quiet-copy">{c.access} · {Math.round(journey.accessMeters)} m</p> : null}
        {journey.legs.map((leg, index) => <div className="journey-leg" key={`${leg.routeCode}:${leg.direction}:${index}`}>
          {index ? <p className="quiet-copy">{c.transferAt} · {leg.from.stationName}</p> : null}
          <div><b className="journey-route-number">{leg.routeName}</b><span>{leg.from.stationName} <ArrowRight size={13} aria-hidden="true" /> {leg.to.stationName}</span></div>
          <button type="button" className="text-action" disabled={!liveRouteCodes.has(leg.routeCode)} onClick={() => onInspect(leg)}>{liveRouteCodes.has(leg.routeCode) ? c.inspect : c.notLive}<ArrowRight size={14} aria-hidden="true" /></button>
        </div>)}
        {journey.egressMeters > 0 ? <p className="quiet-copy">{c.egress} · {Math.round(journey.egressMeters)} m</p> : null}
      </article>)}
      <p className="quiet-copy">{c.note}</p>
    </div> : null}
    {network.data ? <p className="quiet-copy">{c.dated} · {new Date(network.data.fetchedAt).toLocaleString(locale === "en" ? "en-GB" : "zh-MO", { timeZone: "Asia/Macau" })}</p> : null}
    <SourceNote meta={network.meta} />
  </section>;
}
