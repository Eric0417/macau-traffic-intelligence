"use client";

import { useId, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Clock,
  Footprints,
  LocateFixed,
  Map as MapIcon,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { useLiveJson } from "@/components/use-live-json";
import {
  planBusJourneys,
  searchBusStops,
  type BusNetwork,
  type BusJourney,
  type BusJourneyEndpoint,
} from "@/lib/bus-journey";
import { createWalkingRouter, searchJourneyPlaces, type JourneyPlace, type WalkingNetwork, type WalkingPath } from "@/lib/walking-network";
import type { Coordinates } from "@/lib/resident-tools";
import { SourceNote } from "./panels";

const copy = {
  "zh-Hant": {
    scheduled: "班次時間未核實",
    hoursMatch: "搜尋時間喺已核對嘅總站服務時段內",
    now: "現在出發",
    option: "方案",
    total: "乘車合共",
    board: "上車",
    ride: "乘搭",
    alight: "落車",
    towards: "往",
    mapSteps: "地圖與步驟",
    nearbyStops: "包括起終點 1 公里內站牌",
    nearbyHint: "適用手選站牌。搜尋地名時會自動搵附近可步行到達嘅站牌。",
    nearbyAccess: "可由起點附近其他站牌上車。",
    nearbyEgress: "下車後需接駁至所選終點。",
    title: "今次想去邊？",
    intro: "輸入地名或巴士站，比較全程步行、直達巴士同轉乘。",
    origin: "起點",
    destination: "終點",
    placeholder: "搜尋地名、站名或站號",
    current: "使用目前位置",
    locating: "正在定位…",
    here: "目前位置",
    search: "尋找行程方案",
    choose: "請從建議清單選擇起點及終點。",
    empty:
      "未找到符合條件的直達或最多三次轉乘方案。可改選其他站點，或開啟附近站牌搜尋。",
    direct: "直達",
    transfer: "轉乘",
    stops: "站",
    inspect: "查看到站與停站狀態",
    access: "到上車站直線距離",
    egress: "下車站到終點直線距離",
    note: "優先顯示符合已核對服務時段嘅方案。時段以總站開車為準，請再核對中途站到站同轉乘時間。",
    privacy: "地名搜尋同路線計算都喺呢個瀏覽器進行。",
    dated: "路網取得日期",
    partial: "部分路線未收錄，方案可能不完整。",
    loading: "正在讀取官方站序…",
    unavailable: "暫時未能讀取路網",
    retry: "重試",
    chosen: "已選",
    results: "巴士方案",
    transferAt: "同站轉乘",
    same: "起點與終點相同，請選另一個地方。",
    notLive: "目前路線清單未提供即時查詢",
    unknownStop: "請選擇搜尋建議中的站點。",
    place: "地點",
    approximate: "約略位置",
    street: "街道",
    walkOnly: "全程步行",
    walkAccess: "步行到上車站",
    walkEgress: "落車後步行到目的地",
    walkDistance: "估計步行距離",
    noWalk: "呢兩點之間未搵到可用嘅步行路線。",
    walkLoading: "正在載入澳門地名同人行路網…",
    walkUnavailable: "地名同步行路網暫時無法載入。可以繼續按巴士站搜尋。",
    walkSource: "步行路網日期",
    placeEmpty: "未搵到符合條件嘅直達或最多三次轉乘方案。會搜尋 1 公里內站牌，接駁步行路徑最多 1 公里。",
  },
  "zh-Hans": {
    scheduled: "班次时间未核实",
    hoursMatch: "搜索时间在已核对的总站服务时段内",
    now: "现在出发",
    option: "方案",
    total: "乘车合共",
    board: "上车",
    ride: "乘搭",
    alight: "下车",
    towards: "往",
    mapSteps: "地图与步骤",
    nearbyStops: "包括起终点 1 公里内站牌",
    nearbyHint: "适用于手选站牌。搜索地名时会自动找附近可步行到达的站牌。",
    nearbyAccess: "可由起点附近其他站牌上车。",
    nearbyEgress: "下车后需接驳至所选终点。",
    title: "这次想去哪？",
    intro: "输入地名或巴士站，比较全程步行、直达巴士和换乘。",
    origin: "起点",
    destination: "终点",
    placeholder: "搜索地名、站名或站号",
    current: "使用目前位置",
    locating: "正在定位…",
    here: "目前位置",
    search: "寻找行程方案",
    choose: "请从建议清单选择起点及终点。",
    empty:
      "未找到符合条件的直达或最多三次换乘方案。可改选其他站点，或开启附近站牌搜索。",
    direct: "直达",
    transfer: "换乘",
    stops: "站",
    inspect: "查看到站与停站状态",
    access: "到上车站直线距离",
    egress: "下车站到终点直线距离",
    note: "优先显示符合已核对服务时段的方案。时段以总站发车为准，请再核对中途站到站和换乘时间。",
    privacy: "地名搜索和路线计算均在此浏览器进行。",
    dated: "路网取得日期",
    partial: "部分路线未收录，方案可能不完整。",
    loading: "正在读取官方站序…",
    unavailable: "暂时未能读取路网",
    retry: "重试",
    chosen: "已选",
    results: "巴士方案",
    transferAt: "同站转乘",
    same: "起点与终点相同，请选择另一个地点。",
    notLive: "目前路线清单未提供实时查询",
    unknownStop: "请选择搜索建议中的站点。",
    place: "地点",
    approximate: "大致位置",
    street: "街道",
    walkOnly: "全程步行",
    walkAccess: "步行到上车站",
    walkEgress: "下车后步行到目的地",
    walkDistance: "预计步行距离",
    noWalk: "两点之间未找到可用的步行路线。",
    walkLoading: "正在载入澳门地名和人行路网…",
    walkUnavailable: "地名和步行路网暂时无法载入。可以继续按巴士站搜索。",
    walkSource: "步行路网日期",
    placeEmpty: "未找到符合条件的直达或最多三次换乘方案。会搜索 1 公里内站牌，接驳步行路径最多 1 公里。",
  },
  en: {
    scheduled: "Service hours not verified",
    hoursMatch: "Search time is within verified terminal hours",
    now: "Leave now",
    option: "Option",
    total: "Total bus travel",
    board: "Board",
    ride: "Ride",
    alight: "Alight",
    towards: "Towards",
    mapSteps: "Map & steps",
    nearbyStops: "Include stops within 1 km of either endpoint",
    nearbyHint: "Applies to selected bus stops. Named places automatically search nearby stops reachable on foot.",
    nearbyAccess: "Board at an alternative stop near your origin.",
    nearbyEgress: "Continue from the final stop to your selected destination.",
    title: "Where are you going?",
    intro: "Search for a place or stop to compare walking, direct buses and transfers.",
    origin: "From",
    destination: "To",
    placeholder: "Search place, stop name or stop code",
    current: "Use my location",
    locating: "Locating…",
    here: "Current location",
    search: "Find journey options",
    choose: "Select your origin and destination from the suggestions.",
    empty:
      "No direct or up-to-three-transfer option found. Try other stops or include nearby stops.",
    direct: "Direct",
    transfer: "Transfers",
    stops: "stops",
    inspect: "Check arrivals & stop status",
    access: "Straight-line distance to boarding stop",
    egress: "Straight-line distance from final stop",
    note: "Options within verified service hours appear first. Times apply at the terminus. Check departures at your stops and transfer times.",
    privacy: "Place search and routing run in this browser.",
    dated: "Network retrieved",
    partial: "Some routes are missing; options may be incomplete.",
    loading: "Loading official stop sequences…",
    unavailable: "The route network is unavailable",
    retry: "Retry",
    chosen: "Selected",
    results: "Bus options",
    transferAt: "Transfer at the same stop",
    same: "Choose different places for the origin and destination.",
    notLive: "Live lookup is not available in the current route list",
    unknownStop: "Choose a stop from the search suggestions.",
    place: "Place",
    approximate: "Approximate location",
    street: "Street",
    walkOnly: "Walk the whole way",
    walkAccess: "Walk to the boarding stop",
    walkEgress: "Walk from the final stop to the destination",
    walkDistance: "Estimated walking distance",
    noWalk: "No mapped walking route was found between these points.",
    walkLoading: "Loading Macau places and walking paths…",
    walkUnavailable: "Place and walking data could not load. You can still search by bus stop.",
    walkSource: "Walking data date",
    placeEmpty: "No direct or up-to-three-transfer option found. Place searches consider stops within 1 km and walking connections up to 1 km.",
  },
};

const EMPTY_PLACES: JourneyPlace[] = [];

type StopChoice = ReturnType<typeof searchBusStops>[number];
type PlaceChoice = StopChoice | JourneyPlace;

function choiceName(choice: PlaceChoice) {
  return "stationCode" in choice ? choice.stationName : choice.name;
}

function choiceKey(choice: PlaceChoice | null) {
  if (!choice) return undefined;
  return "stationCode" in choice ? choice.stationCode : choice.id;
}

function journeyEndpoint(choice: PlaceChoice | null, coordinates: Coordinates): BusJourneyEndpoint {
  return choice && "stationCode" in choice ? { stationCode: choice.stationCode } : { coordinates };
}

function PlaceField({
  label,
  network,
  places,
  placeLabels,
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
  places: JourneyPlace[];
  placeLabels: { place: string; approximate: string; street: string };
  selected: PlaceChoice | null;
  onChange: (value: string) => void;
  onSelect: (choice: PlaceChoice) => void;
  placeholder: string;
  chosen: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => {
    if (selected || !value.trim()) return [];
    const stops = network ? searchBusStops(network, value).slice(0, 6) : [];
    const named = searchJourneyPlaces(places, value);
    return [...named, ...stops];
  }, [network, places, value, selected]);
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
          {chosen} · {"stationCode" in selected ? selected.stationCode : selected.context || (selected.approximate ? placeLabels.approximate : placeLabels.place)}
        </small>
      ) : null}
      {matches.length ? (
        <ul className="journey-suggestions" aria-label={label}>
          {matches.map((stop) => (
            <li key={choiceKey(stop)}>
              <button
                type="button"
                onClick={() => {
                  onSelect(stop);
                  inputRef.current?.focus();
                }}
              >
                <span>{choiceName(stop)}</span>
                <small>{"stationCode" in stop ? stop.stationCode : [stop.street ? placeLabels.street : placeLabels.place, stop.context, stop.approximate ? placeLabels.approximate : null].filter(Boolean).join(" · ")}</small>
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
    walkingMappedAt?: string,
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
  const walkingSource = useLiveJson<WalkingNetwork>(
    "/api/v1/journeys/walking-network", 86_400_000, enabled,
  );
  const places = walkingSource.data?.places ?? EMPTY_PLACES;
  const [originText, setOriginText] = useState("");
  const [destinationText, setDestinationText] = useState("");
  const [origin, setOrigin] = useState<PlaceChoice | null>(null);
  const [destination, setDestination] = useState<PlaceChoice | null>(null);
  const [useLocation, setUseLocation] = useState(false);
  const [includeNearbyStops, setIncludeNearbyStops] = useState(false);
  const [result, setResult] = useState<{
    key: string;
    journeys: BusJourney[];
    walk: WalkingPath | null;
    departureTime: string;
  } | null>(null);
  const resultKey = JSON.stringify([
    network.data?.fetchedAt, walkingSource.data?.mappedAt,
    useLocation ? location : choiceKey(origin), choiceKey(destination), includeNearbyStops,
  ]);
  const currentResult = result?.key === resultKey && !(useLocation && (locating || locationError))
    ? result : null;
  const journeys = currentResult?.journeys;
  const originCoordinates = useLocation ? location : origin?.coordinates;
  const placeSearch = Boolean((!useLocation && origin && "id" in origin) || (destination && "id" in destination));

  function showJourney(journey: BusJourney) {
    if (!originCoordinates || !destination) return;
    onShowJourney(
      journey, originCoordinates, destination.coordinates, network.data?.fetchedAt ?? "",
      choiceName(destination), journey.walking ? walkingSource.data?.mappedAt : undefined,
    );
  }
  const [message, setMessage] = useState<string | null>(null);
  const clearResults = () => {
    setResult(null);
    setMessage(null);
  };
  return (
    <section className="journey-planner" aria-labelledby={`${resultId}-title`}>
      <div className="section-heading">
        <h2 id={`${resultId}-title`}>{c.title}</h2>
        <span className="journey-now"><Clock size={14} aria-hidden="true" />{c.now}</span>
      </div>
      <p className="quiet-copy">{c.intro}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!destination || !originCoordinates || (useLocation && (locating || locationError))) {
            setMessage(c.choose);
            return;
          }
          if (!useLocation && choiceKey(origin) === choiceKey(destination)) {
            setMessage(c.same);
            setResult(null);
            return;
          }
          const router = walkingSource.data ? createWalkingRouter(walkingSource.data) : null;
          if (placeSearch && !router) {
            setMessage(c.walkUnavailable);
            return;
          }
          const access = router?.(originCoordinates);
          const walk = access?.(destination.coordinates) ?? null;
          const egress = placeSearch ? router?.(destination.coordinates, true) : undefined;
          const time = new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Macau", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
          }).format(new Date());
          const [hour, minute] = time.split(":").map(Number);
          setMessage(null);
          const nextResult = {
            key: resultKey,
            walk,
            departureTime: time,
            journeys: network.data ? planBusJourneys(
              network.data,
              journeyEndpoint(useLocation ? null : origin, originCoordinates),
              journeyEndpoint(destination, destination.coordinates),
              {
                includeNearbyStops,
                departureMinute: hour * 60 + minute,
                walking: placeSearch && access && egress ? { access, egress } : undefined,
              },
            ) : [],
          };
          setResult(nextResult);
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
              places={places}
              placeLabels={c}
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
                setOriginText(choiceName(stop));
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
            places={places}
            placeLabels={c}
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
              setDestinationText(choiceName(stop));
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
            disabled={(!network.data && !walkingSource.data) || locating}
          >
            {c.search}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </form>
      <p className="quiet-copy">{c.privacy}</p>
      {walkingSource.loading && !walkingSource.data ? <p role="status">{c.walkLoading}</p> : null}
      {walkingSource.error && !walkingSource.data ? (
        <p className="data-warning" role="status">
          {c.walkUnavailable} <button type="button" onClick={walkingSource.refresh}>{c.retry}</button>
        </p>
      ) : null}
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
      {currentResult?.walk ? (
        <article className="journey-option journey-walk-option" aria-label={c.walkOnly}>
          <header className="journey-option-heading">
            <h4><Footprints size={16} aria-hidden="true" /> {c.walkOnly}</h4>
            <span>{c.walkDistance} · {currentResult.walk.meters.toLocaleString()} m</span>
          </header>
          <footer><button type="button" className="journey-map-action" onClick={() => showJourney({
            id: "walking", legs: [], totalStops: 0, transferMeters: 0, accessMeters: 0, egressMeters: 0,
            walking: { direct: currentResult.walk! },
          })}><MapIcon size={16} aria-hidden="true" />{c.mapSteps}</button></footer>
        </article>
      ) : currentResult && walkingSource.data ? <p className="quiet-copy">{c.noWalk}</p> : null}
      {journeys ? (
        <div className="journey-results" aria-live="polite">
          <h3>
            {c.results} · {journeys.length}
          </h3>
          {!journeys.length ? <p>{placeSearch ? c.placeEmpty : c.empty}</p> : null}
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
                    {journey.legs.length === 1 ? c.direct : `${c.transfer} · ${journey.legs.length - 1}`}
                  </span>
                </div>
                <p className="journey-schedule-note">
                  <Clock size={13} aria-hidden="true" />
                  {currentResult.departureTime} · {journey.legs.every((leg) => leg.serviceWindows) ? c.hoursMatch : c.scheduled}
                </p>
              </header>
              {journey.accessMeters > 0 ? (
                <div className="journey-access">
                  <Footprints size={16} aria-hidden="true" />
                  <p>
                    {journey.walking?.access ? c.walkAccess : c.access} · {Math.round(journey.accessMeters)} m
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
                    {journey.walking?.egress ? c.walkEgress : c.egress} · {Math.round(journey.egressMeters)} m
                    <small>{c.nearbyEgress}</small>
                  </p>
                </div>
              ) : null}
              <footer>
                <button
                  type="button"
                  className="journey-map-action"
                  onClick={() => showJourney(journey)}
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
      {walkingSource.data ? <p className="quiet-copy">
        {c.walkSource} · {new Date(walkingSource.data.mappedAt).toLocaleDateString(
          locale === "en" ? "en-GB" : "zh-MO", { timeZone: "Asia/Macau" },
        )} · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>
      </p> : null}
    </section>
  );
}
