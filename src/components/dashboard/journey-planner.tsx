"use client";

import { useId, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Clock,
  Footprints,
  LocateFixed,
  Map as MapIcon,
  Route,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { useLiveJson } from "@/components/use-live-json";
import {
  planBusJourneys,
  searchBusStops,
  type BusNetwork,
  type BusJourney,
} from "@/lib/bus-journey";
import type { Coordinates } from "@/lib/resident-tools";
import { SourceNote } from "./panels";

const copy = {
  "zh-Hant": {
    scheduled: "班次時間未核實",
    option: "方案",
    total: "乘車合共",
    board: "上車",
    ride: "乘搭",
    alight: "落車",
    towards: "往",
    mapSteps: "地圖與步驟",
    nearbyStops: "包括起終點 500 米內站牌",
    nearbyHint:
      "適用手選站點；目前位置本身會搜尋附近站牌。距離以直線計算，步行路徑待確認。",
    nearbyAccess: "可由起點附近其他站牌上車。",
    nearbyEgress: "下車後需接駁至所選終點。",
    title: "今次想去邊？",
    intro: "由你附近，搵直達或一次轉乘嘅巴士。",
    origin: "起點",
    destination: "終點",
    placeholder: "搜尋站名或站號",
    current: "使用目前位置",
    locating: "正在定位…",
    here: "目前位置",
    search: "尋找巴士方案",
    choose: "請從建議清單選擇起點及終點。",
    empty:
      "未找到符合條件的直達或一次轉乘方案。可改選其他站點，或開啟附近站牌搜尋。",
    direct: "直達",
    transfer: "轉乘一次",
    stops: "站",
    inspect: "查看到站與停站狀態",
    access: "到上車站直線距離",
    egress: "下車站到終點直線距離",
    note: "先按乘車站數，再按直線接駁距離、轉乘次數排列。未計步行路徑、班次時間或臨時改道；出發前請查看每段路線的到站與停站狀態。",
    privacy: "定位只在此瀏覽器內計算。終點請選附近巴士站。",
    dated: "路網取得日期",
    partial: "部分路線未收錄，方案可能不完整。",
    loading: "正在讀取官方站序…",
    unavailable: "暫時未能讀取路網",
    retry: "重試",
    chosen: "已選",
    results: "巴士方案",
    transferAt: "同站轉乘",
    same: "起點與終點相同，請選另一個站點。",
    notLive: "目前路線清單未提供即時查詢",
    unknownStop: "請選擇搜尋建議中的站點。",
  },
  "zh-Hans": {
    scheduled: "班次时间未核实",
    option: "方案",
    total: "乘车合共",
    board: "上车",
    ride: "乘搭",
    alight: "下车",
    towards: "往",
    mapSteps: "地图与步骤",
    nearbyStops: "包括起终点 500 米内站牌",
    nearbyHint:
      "适用手选站点；目前位置本身会搜索附近站牌。距离以直线计算，步行路径待确认。",
    nearbyAccess: "可由起点附近其他站牌上车。",
    nearbyEgress: "下车后需接驳至所选终点。",
    title: "这次想去哪？",
    intro: "从你附近，找直达或一次转乘的巴士。",
    origin: "起点",
    destination: "终点",
    placeholder: "搜索站名或站号",
    current: "使用目前位置",
    locating: "正在定位…",
    here: "目前位置",
    search: "寻找巴士方案",
    choose: "请从建议清单选择起点及终点。",
    empty:
      "未找到符合条件的直达或一次转乘方案。可改选其他站点，或开启附近站牌搜索。",
    direct: "直达",
    transfer: "转乘一次",
    stops: "站",
    inspect: "查看到站与停站状态",
    access: "到上车站直线距离",
    egress: "下车站到终点直线距离",
    note: "先按乘车站数，再按直线接驳距离、转乘次数排列。未计步行路径、班次时间或临时改道；出发前请查看每段路线的到站与停站状态。",
    privacy: "定位只在此浏览器内计算。终点请选择附近巴士站。",
    dated: "路网取得日期",
    partial: "部分路线未收录，方案可能不完整。",
    loading: "正在读取官方站序…",
    unavailable: "暂时未能读取路网",
    retry: "重试",
    chosen: "已选",
    results: "巴士方案",
    transferAt: "同站转乘",
    same: "起点与终点相同，请选另一个站点。",
    notLive: "目前路线清单未提供实时查询",
    unknownStop: "请选择搜索建议中的站点。",
  },
  en: {
    scheduled: "Service hours not verified",
    option: "Option",
    total: "Total bus travel",
    board: "Board",
    ride: "Ride",
    alight: "Alight",
    towards: "Towards",
    mapSteps: "Map & steps",
    nearbyStops: "Include stops within 500 m of either endpoint",
    nearbyHint:
      "Applies to selected stops. Current location already searches nearby stops. Distances are straight-line estimates; walking paths are unverified.",
    nearbyAccess: "Board at an alternative stop near your origin.",
    nearbyEgress: "Continue from the final stop to your selected destination.",
    title: "Where are you going?",
    intro: "Find a direct bus or one transfer from nearby.",
    origin: "From",
    destination: "To",
    placeholder: "Search stop name or code",
    current: "Use my location",
    locating: "Locating…",
    here: "Current location",
    search: "Find bus options",
    choose: "Select your origin and destination from the suggestions.",
    empty:
      "No direct or one-transfer option found. Try other stops or include nearby stops.",
    direct: "Direct",
    transfer: "One transfer",
    stops: "stops",
    inspect: "Check arrivals & stop status",
    access: "Straight-line distance to boarding stop",
    egress: "Straight-line distance from final stop",
    note: "Sorted by bus stops travelled, then straight-line access distance and transfers. Walking paths, service hours and diversions are not included; check each leg before leaving.",
    privacy:
      "Location stays in this browser. Choose a bus stop near your destination.",
    dated: "Network retrieved",
    partial: "Some routes are missing; options may be incomplete.",
    loading: "Loading official stop sequences…",
    unavailable: "The route network is unavailable",
    retry: "Retry",
    chosen: "Selected",
    results: "Bus options",
    transferAt: "Transfer at the same stop",
    same: "Origin and destination are the same. Choose another stop.",
    notLive: "Live lookup is not available in the current route list",
    unknownStop: "Choose a stop from the search suggestions.",
  },
};

type StopChoice = ReturnType<typeof searchBusStops>[number];

function PlaceField({
  label,
  network,
  value,
  selected,
  onChange,
  onSelect,
  placeholder,
  chosen,
}: {
  label: string;
  network: BusNetwork | null;
  value: string;
  selected: StopChoice | null;
  onChange: (value: string) => void;
  onSelect: (stop: StopChoice) => void;
  placeholder: string;
  chosen: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = useMemo(
    () =>
      network && value.trim() && !selected
        ? searchBusStops(network, value).slice(0, 6)
        : [],
    [network, value, selected],
  );
  return (
    <div className="journey-place">
      <label htmlFor={id}>{label}</label>
      <input
        ref={inputRef}
        id={id}
        type="search"
        value={value}
        aria-describedby={selected ? `${id}-selected` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {selected ? (
        <small id={`${id}-selected`}>
          {chosen} · {selected.stationCode}
        </small>
      ) : null}
      {matches.length ? (
        <ul className="journey-suggestions" aria-label={label}>
          {matches.map((stop) => (
            <li key={stop.stationCode}>
              <button
                type="button"
                onClick={() => {
                  onSelect(stop);
                  inputRef.current?.focus();
                }}
              >
                <span>{stop.stationName}</span>
                <small>{stop.stationCode}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function JourneyPlanner({
  enabled,
  location,
  locating,
  locationError,
  onLocate,
  onInspect,
  onShowJourney,
  liveRouteCodes,
}: {
  enabled: boolean;
  location: Coordinates | null;
  locating: boolean;
  locationError: boolean;
  onLocate: () => void;
  onInspect: (leg: BusJourney["legs"][number]) => void;
  onShowJourney: (
    journey: BusJourney,
    origin: Coordinates,
    destination: Coordinates,
    networkFetchedAt: string,
    destinationName: string,
  ) => void;
  liveRouteCodes: Set<string>;
}) {
  const { locale, t } = useLanguage();
  const c = copy[locale];
  const resultId = useId();
  const network = useLiveJson<BusNetwork>(
    "/api/v1/bus/network",
    21_600_000,
    enabled,
  );
  const [originText, setOriginText] = useState("");
  const [destinationText, setDestinationText] = useState("");
  const [origin, setOrigin] = useState<StopChoice | null>(null);
  const [destination, setDestination] = useState<StopChoice | null>(null);
  const [useLocation, setUseLocation] = useState(false);
  const [includeNearbyStops, setIncludeNearbyStops] = useState(false);
  const [result, setResult] = useState<{
    key: string;
    journeys: BusJourney[];
  } | null>(null);
  const resultKey = `${network.data?.fetchedAt}:${useLocation ? location?.join(",") : origin?.stationCode}:${destination?.stationCode}:${includeNearbyStops}`;
  const journeys =
    result?.key === resultKey && !(useLocation && (locating || locationError))
      ? result.journeys
      : null;
  const originCoordinates = useLocation ? location : origin?.coordinates;
  const [message, setMessage] = useState<string | null>(null);
  const clearResults = () => {
    setResult(null);
    setMessage(null);
  };
  return (
    <section className="journey-planner" aria-labelledby="journey-title">
      <div className="section-heading">
        <h2 id="journey-title">{c.title}</h2>
        <Route size={20} aria-hidden="true" />
      </div>
      <p className="quiet-copy">{c.intro}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (
            !network.data ||
            !destination ||
            (!useLocation && !origin) ||
            (useLocation && (!location || locating || locationError))
          ) {
            setMessage(c.choose);
            return;
          }
          if (!useLocation && origin?.stationCode === destination.stationCode) {
            setMessage(c.same);
            setResult(null);
            return;
          }
          setMessage(null);
          setResult({
            key: resultKey,
            journeys: planBusJourneys(
              network.data,
              useLocation
                ? { coordinates: location! }
                : { stationCode: origin!.stationCode },
              { stationCode: destination.stationCode },
              { includeNearbyStops },
            ),
          });
        }}
      >
        <div className="journey-fields">
          {useLocation ? (
            <div className="journey-place">
              <span>{c.origin}</span>
              <p className="journey-current">
                <LocateFixed size={16} aria-hidden="true" />
                {locating ? c.locating : c.here}
              </p>
              <button
                className="text-action"
                type="button"
                onClick={() => {
                  setUseLocation(false);
                  clearResults();
                }}
              >
                {c.placeholder}
              </button>
            </div>
          ) : (
            <PlaceField
              label={c.origin}
              network={network.data}
              value={originText}
              selected={origin}
              placeholder={c.placeholder}
              chosen={c.chosen}
              onChange={(value) => {
                setOriginText(value);
                setOrigin(null);
                clearResults();
              }}
              onSelect={(stop) => {
                setOrigin(stop);
                setOriginText(stop.stationName);
                clearResults();
              }}
            />
          )}
          <ArrowDown
            size={16}
            className="journey-direction"
            aria-hidden="true"
          />
          <PlaceField
            label={c.destination}
            network={network.data}
            value={destinationText}
            selected={destination}
            placeholder={c.placeholder}
            chosen={c.chosen}
            onChange={(value) => {
              setDestinationText(value);
              setDestination(null);
              clearResults();
            }}
            onSelect={(stop) => {
              setDestination(stop);
              setDestinationText(stop.stationName);
              clearResults();
            }}
          />
        </div>
        <label className="journey-nearby-toggle">
          <input
            type="checkbox"
            checked={includeNearbyStops}
            onChange={(event) => {
              setIncludeNearbyStops(event.target.checked);
              clearResults();
            }}
          />
          <span>
            {c.nearbyStops}
            <small>{c.nearbyHint}</small>
          </span>
        </label>
        <div className="journey-actions">
          <button
            type="button"
            className="text-action"
            disabled={locating}
            onClick={() => {
              setUseLocation(true);
              clearResults();
              onLocate();
            }}
          >
            <LocateFixed size={15} aria-hidden="true" />
            {locating ? c.locating : c.current}
          </button>
          <button
            type="submit"
            className="journey-submit"
            disabled={!network.data || locating}
          >
            {c.search}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </form>
      <p className="quiet-copy">{c.privacy}</p>
      {network.loading && !network.data ? (
        <p role="status">{c.loading}</p>
      ) : null}
      {network.error ? (
        <p className="data-warning" role="status">
          {c.unavailable}{" "}
          <button type="button" onClick={network.refresh}>
            {c.retry}
          </button>
        </p>
      ) : null}
      {message ? (
        <p className="data-warning" role="status">
          {message}
        </p>
      ) : null}
      {network.data?.coverage.missingRoutes.length ? (
        <p className="data-warning">
          {c.partial} {network.data.coverage.loadedRoutes}/
          {network.data.coverage.catalogRoutes}
        </p>
      ) : null}
      {journeys ? (
        <div className="journey-results" aria-live="polite">
          <h3>
            {c.results} · {journeys.length}
          </h3>
          {!journeys.length ? <p>{c.empty}</p> : null}
          {journeys.map((journey, optionIndex) => (
            <article
              className="journey-option"
              key={journey.id}
              aria-labelledby={`${resultId}-option-${optionIndex}`}
            >
              <header>
                <div className="journey-option-heading">
                  <h4 id={`${resultId}-option-${optionIndex}`}>
                    {c.option} {optionIndex + 1}
                  </h4>
                  <span>
                    {c.total} {journey.totalStops} {c.stops}
                  </span>
                </div>
                <div className="journey-option-summary">
                  <div className="journey-route-chain">
                    {journey.legs.map((leg, index) => (
                      <span key={`${leg.routeCode}:${leg.direction}:${index}`}>
                        {index ? (
                          <ArrowRight size={14} aria-hidden="true" />
                        ) : null}
                        <b>{leg.routeName}</b>
                      </span>
                    ))}
                  </div>
                  <span className="journey-route-kind">
                    {journey.legs.length === 1 ? c.direct : c.transfer}
                  </span>
                </div>
                <p className="journey-schedule-note">
                  <Clock size={13} aria-hidden="true" />
                  {c.scheduled}
                </p>
              </header>
              {journey.accessMeters > 0 ? (
                <div className="journey-access">
                  <Footprints size={16} aria-hidden="true" />
                  <p>
                    {c.access} · {Math.round(journey.accessMeters)} m
                    <small>{c.nearbyAccess}</small>
                  </p>
                </div>
              ) : null}
              <ol className="journey-legs">
                {journey.legs.map((leg, index) => (
                  <li
                    className="journey-leg"
                    key={`${leg.routeCode}:${leg.direction}:${index}`}
                  >
                    {index ? (
                      <p className="journey-transfer">
                        <ArrowDown size={14} aria-hidden="true" />
                        {c.transferAt} · {leg.from.stationName} ·{" "}
                        {leg.from.stationCode}
                      </p>
                    ) : null}
                    <div className="journey-leg-heading">
                      <span className="journey-leg-index" aria-hidden="true">
                        {index + 1}
                      </span>
                      <div>
                        <b>{leg.routeName}</b>
                        <span>
                          {leg.direction === 0 ? t("outbound") : t("return")} ·{" "}
                          {leg.circular ? (locale === "en" ? "Circular route" : locale === "zh-Hans" ? "循环线" : "循環線") : `${c.towards} ${leg.terminalName}`}
                        </span>
                      </div>
                    </div>
                    <dl className="journey-leg-stops">
                      <div>
                        <dt>{c.board}</dt>
                        <dd>
                          <strong>{leg.from.stationName}</strong>
                          <small>{leg.from.stationCode}</small>
                        </dd>
                      </div>
                      <div className="journey-ride">
                        <dt>{c.ride}</dt>
                        <dd>
                          {leg.stopCount} {c.stops}
                        </dd>
                      </div>
                      <div>
                        <dt>{c.alight}</dt>
                        <dd>
                          <strong>{leg.to.stationName}</strong>
                          <small>{leg.to.stationCode}</small>
                        </dd>
                      </div>
                    </dl>
                    <button
                      type="button"
                      className="text-action"
                      disabled={!liveRouteCodes.has(leg.routeCode)}
                      onClick={() => onInspect(leg)}
                    >
                      {liveRouteCodes.has(leg.routeCode)
                        ? c.inspect
                        : c.notLive}
                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ol>
              {journey.egressMeters > 0 ? (
                <div className="journey-access">
                  <Footprints size={16} aria-hidden="true" />
                  <p>
                    {c.egress} · {Math.round(journey.egressMeters)} m
                    <small>{c.nearbyEgress}</small>
                  </p>
                </div>
              ) : null}
              <footer>
                <button
                  type="button"
                  className="journey-map-action"
                  disabled={!originCoordinates || !destination || !network.data}
                  onClick={() => {
                    if (originCoordinates && destination && network.data)
                      onShowJourney(
                        journey,
                        originCoordinates,
                        destination.coordinates,
                        network.data.fetchedAt,
                        destination.stationName,
                      );
                  }}
                >
                  <MapIcon size={16} aria-hidden="true" />
                  {c.mapSteps}
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
              </footer>
            </article>
          ))}
          <p className="quiet-copy">{c.note}</p>
        </div>
      ) : null}
      {network.data ? (
        <p className="quiet-copy">
          {c.dated} ·{" "}
          {new Date(network.data.fetchedAt).toLocaleString(
            locale === "en" ? "en-GB" : "zh-MO",
            { timeZone: "Asia/Macau" },
          )}
        </p>
      ) : null}
      <SourceNote meta={network.meta} />
    </section>
  );
}
