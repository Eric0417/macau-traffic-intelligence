"use client";

import { ArrowLeft, ExternalLink, Footprints } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import type { LiveJsonResult } from "@/components/use-live-json";
import type { BusJourney, BusJourneyLeg } from "@/lib/bus-journey";
import type { BusEta } from "@/lib/types";
import type { Coordinates } from "@/lib/resident-tools";
import { metaIsDelayed } from "@/lib/live-status";
import { distanceMeters } from "@/lib/resident-tools";
import { JOURNEY_COLORS } from "./journey-map";
import { walkingPathBetween, type WalkingPath } from "@/lib/walking-network";
import { walkingNavigationUrl } from "@/lib/walking-navigation";
import { BusArrivalEstimate } from "./bus-arrival-estimate";
import { SourceNote } from "./panels";

export interface SelectedJourney {
  journey: BusJourney;
  origin: Coordinates;
  destination: Coordinates;
  destinationName: string;
  networkFetchedAt: string;
  walkingMappedAt?: string;
  itineraryStops?: Array<{ name: string; coordinates: Coordinates }>;
  sectionLabel?: string;
}

const copy = {
  "zh-Hant": { title: "行程地圖與步驟", back: "返回方案", map: "查看行程地圖", walkTo: "前往上車站", walkEnd: "步行到目的地", walk: "開啟 Google 地圖步行導航", privacy: "按步行導航會將該段起終點交畀 Google 地圖。此頁虛線只表示直線接駁，並非實際行人路。", board: "上車", alight: "落車", ride: "乘搭", stops: "站後", toward: "往", transfer: "同一站牌轉乘", inspect: "查看本程到站資料", checking: "正在核對官方走線與停站…", missing: "部分官方走線未能核實，地圖暫時省略該段，請先查本程資料。", suspended: "此程上落站有臨時停靠調整，請先查本程資料。", dated: "站序快照", distance: "直線距離", noLive: "目前路線未提供到站查詢", legs: "程巴士", scheduled: "站數來自站序快照；班次及臨時改道需核對目前資料。" },
  "zh-Hans": { title: "行程地图与步骤", back: "返回方案", map: "查看行程地图", walkTo: "前往上车站", walkEnd: "步行到目的地", walk: "打开 Google 地图步行导航", privacy: "按步行导航会将该段起终点交给 Google 地图。此页虚线只表示直线接驳，并非实际人行路。", board: "上车", alight: "下车", ride: "乘搭", stops: "站后", toward: "往", transfer: "同一站牌转乘", inspect: "查看本程到站资料", checking: "正在核对官方走线与停站…", missing: "部分官方走线未能核实，地图暂时省略该段，请先查本程资料。", suspended: "此程上下站有临时停靠调整，请先查本程资料。", dated: "站序快照", distance: "直线距离", noLive: "目前路线未提供到站查询", legs: "程巴士", scheduled: "站数来自站序快照；班次及临时改道需核对目前资料。" },
  en: { title: "Journey map & steps", back: "Back to options", map: "Show journey map", walkTo: "Go to the boarding stop", walkEnd: "Walk to the destination", walk: "Open walking directions in Google Maps", privacy: "Opening walking directions shares that leg's endpoints with Google Maps. Dashed links here are straight-line connections, not verified walking paths.", board: "Board at", alight: "Alight at", ride: "Ride", stops: "stops, then", toward: "Towards", transfer: "Transfer at the same stop code", inspect: "Check this leg's arrivals", checking: "Checking official geometry and stops…", missing: "Some official geometry could not be verified and is omitted. Check the affected leg before travelling.", suspended: "A boarding or alighting stop has a temporary service change. Check this leg.", dated: "Stop-order snapshot", distance: "Straight-line distance", noLive: "Live lookup is unavailable for this route", legs: "bus legs", scheduled: "Stop counts use the dated topology. Check current departures and temporary changes separately." },
};

function terminalTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function JourneyMapDetail({ selected, states, missingLegs, uncertainTransfers, onBack, onMap, onInspect, liveRouteCodes }: {
  selected: SelectedJourney; states: LiveJsonResult<BusEta>[]; missingLegs: number[]; uncertainTransfers: number[];
  onBack: () => void; onMap: () => void; onInspect: (leg: BusJourneyLeg) => void; liveRouteCodes: Set<string>;
}) {
  const { locale } = useLanguage();
  const c = copy[locale];
  const { journey } = selected;
  const positionTitle = locale === "en" ? "Current vehicle estimates" : locale === "zh-Hans" ? "目前车辆估算位置" : "目前車輛估算位置";
  const positionsUnavailable = locale === "en" ? "No current vehicle positions available" : locale === "zh-Hans" ? "暂无最新车辆位置" : "暫時未有最新車輛位置";
  const transferWarning = locale === "en" ? "The two routes report different positions for this stop. Confirm where to board." : locale === "zh-Hans" ? "两条路线提供的站点位置有差异，请核对上车位置。" : "兩條路線提供嘅站點位置有出入，請核對上車位置。";
  const first = journey.legs[0], last = journey.legs.at(-1);
  const endpoint = (leg: BusJourneyLeg, index: number, end: "from" | "to") => {
    const eta = states[index]?.data;
    const matches = eta?.routeCode === leg.routeCode && eta.direction === leg.direction
      ? eta.stops.filter((stop) => stop.stationCode === leg[end].stationCode && stop.coordinates) : [];
    return matches.length === 1 ? matches[0].coordinates! : leg[end].coordinates;
  };
  const boardingCoordinates = first ? endpoint(first, 0, "from") : selected.origin;
  const alightingCoordinates = last ? endpoint(last, journey.legs.length - 1, "to") : selected.destination;
  const accessMeters = distanceMeters(selected.origin, boardingCoordinates);
  const egressMeters = distanceMeters(alightingCoordinates, selected.destination);
  const walkOnly = locale === "en" ? "Walk the whole way" : locale === "zh-Hans" ? "全程步行" : "全程步行";
  const walkingDistance = locale === "en" ? "Estimated walking distance" : locale === "zh-Hans" ? "预计步行距离" : "估計步行距離";
  const walking = (from: Coordinates, to: Coordinates, title: string, planned?: WalkingPath) => {
    const path = walkingPathBetween(planned, from, to);
    return <li className="journey-step journey-walk-step">
    <Footprints size={18} aria-hidden="true" /><h3>{title}</h3>
    <p>{path ? walkingDistance : c.distance} · {Math.round(path?.meters ?? distanceMeters(from, to)).toLocaleString()} m</p>
    <p className="quiet-copy">{locale === "en" ? "Opening this link shares these endpoints with Google Maps." : locale === "zh-Hans" ? "打开后会将这段起终点分享给 Google 地图。" : "開啟後會將呢段起終點分享畀 Google 地圖。"}</p>
    <a href={walkingNavigationUrl(from, to)} target="_blank" rel="noreferrer" referrerPolicy="no-referrer" className="text-action">{c.walk}<ExternalLink size={14} aria-hidden="true" /></a>
  </li>;
  };
  return <section className="journey-map-detail" tabIndex={-1} aria-labelledby="journey-map-title">
    <button type="button" className="text-action" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />{c.back}</button>
    {selected.sectionLabel ? <p className="eyebrow">{selected.sectionLabel}</p> : null}
    {selected.sectionLabel ? <p className="quiet-copy">{locale === "en" ? "Vehicle information is current at lookup time, not a prediction for a later connection." : locale === "zh-Hans" ? "车辆信息是查询时的车况，不代表稍后接驳时的班次。" : "車輛資料係查詢當刻嘅車況，唔代表稍後接駁時嘅班次。"}</p> : null}
    <div className="section-heading"><h2 id="journey-map-title">{c.title}</h2><span>{first ? `${journey.legs.length} ${c.legs}` : walkOnly}</span></div>
    <button type="button" className="primary-action" onClick={onMap}>{c.map}</button>
    {first ? <p className="quiet-copy">{c.dated} · {new Date(selected.networkFetchedAt).toLocaleString(locale === "en" ? "en-GB" : "zh-MO", { timeZone: "Asia/Macau" })}</p> : null}
    {selected.walkingMappedAt ? <p className="quiet-copy">
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a> · {new Date(selected.walkingMappedAt).toLocaleDateString(
        locale === "en" ? "en-GB" : "zh-MO", { timeZone: "Asia/Macau" },
      )}
    </p> : null}
    {states.some((state) => state.loading) ? <p role="status" className="journey-map-status">{c.checking}</p> : null}
    {!states.some((state) => state.loading) && missingLegs.length ? <p role="status" className="data-warning">{c.missing}</p> : null}
    <ol className="journey-steps">
      {journey.walking?.direct ? walking(selected.origin, selected.destination, `${walkOnly} · ${selected.destinationName}`, journey.walking.direct) : null}
      {first && accessMeters > 1 ? walking(selected.origin, boardingCoordinates, `${c.walkTo} · ${first.from.stationName} (${first.from.stationCode})`, journey.walking?.access) : null}
      {journey.legs.map((leg, index) => {
        const state = states[index];
        const eta = state?.data?.routeCode === leg.routeCode && state.data.direction === leg.direction ? state.data : null;
        const suspended = eta?.stops.some((stop) => (stop.stationCode === leg.from.stationCode || stop.stationCode === leg.to.stationCode) && stop.suspended);
        const vehicles = eta && state.meta && !metaIsDelayed(state.meta) && !state.error
          ? eta.vehicles.filter((vehicle) => vehicle.positionSource === "feed" && vehicle.coordinates)
          : [];
        const boardingStop = eta?.stops.find(stop => stop.stationCode === leg.from.stationCode);
        return <li className="journey-step" key={`${leg.routeCode}:${leg.direction}`} style={{ borderLeft: `3px solid ${JOURNEY_COLORS[index % JOURNEY_COLORS.length]}` }}>
          {index ? <p className="quiet-copy">{uncertainTransfers.includes(index) ? transferWarning : `${c.transfer} · ${leg.from.stationCode}`}</p> : null}
          <h3><span className="journey-route-number">{leg.routeName}</span> {leg.circular ? (locale === "en" ? "Circular route" : locale === "zh-Hans" ? "循环线" : "循環線") : `${c.toward} ${leg.terminalName}`}</h3>
          <p className="journey-step-stop"><span>{c.board}</span><strong>{leg.from.stationName}</strong><small>{leg.from.stationCode}</small></p>
          <p>{c.ride} {leg.stopCount} {c.stops}</p>
          <p className="journey-step-stop"><span>{c.alight}</span><strong>{leg.to.stationName}</strong><small>{leg.to.stationCode}</small></p>
          {leg.serviceWindows?.length ? <p className="quiet-copy">
            <a href={`https://www.dsat.gov.mo/dsat/route_display.aspx?route=busroute_${encodeURIComponent(leg.routeName)}`} target="_blank" rel="noreferrer">
              {locale === "en" ? "Official terminal hours" : locale === "zh-Hans" ? "官方总站班次" : "官方總站班次"}
            </a> · {leg.serviceWindows.map(([start, end]) => `${terminalTime(start)}–${terminalTime(end)}`).join(" / ")}
          </p> : null}
          {suspended ? <p className="data-warning">{c.suspended}</p> : null}
          {index === 0 && !selected.sectionLabel && boardingStop ? <p className="quiet-copy">
            <BusArrivalEstimate stop={boardingStop} disabled={!state.meta || metaIsDelayed(state.meta) || Boolean(state.error)} />
          </p> : null}
          {vehicles.length ? <details>
            <summary>{positionTitle} ({vehicles.length})</summary>
            <ul>{vehicles.map((vehicle) => <li key={vehicle.id}>
              {vehicle.plate || leg.routeName} · {locale === "en" ? "Approaching" : "往"} {vehicle.stationName}
            </li>)}</ul>
          </details> : <p className="quiet-copy">{positionsUnavailable}</p>}
          <button className="text-action" type="button" disabled={!liveRouteCodes.has(leg.routeCode)} onClick={() => onInspect(leg)}>{liveRouteCodes.has(leg.routeCode) ? c.inspect : c.noLive}</button>
          <SourceNote meta={eta ? state.meta : null} />
        </li>;
      })}
      {egressMeters > 1 ? walking(alightingCoordinates, selected.destination, `${c.walkEnd} · ${selected.destinationName}`, journey.walking?.egress) : null}
    </ol>
    {first ? <p className="quiet-copy">{c.scheduled}</p> : null}
    {accessMeters > 1 || egressMeters > 1 ? <p className="quiet-copy">{c.privacy}</p> : null}
  </section>;
}
