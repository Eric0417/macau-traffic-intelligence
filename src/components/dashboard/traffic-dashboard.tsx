"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BusFront,
  CircleParking,
  Layers3,
  List,
  Map as MapIcon,
  Moon,
  MoreHorizontal,
  Navigation,
  Sun,
  TramFront,
  Video,
  Bell,
  Activity,
  Sparkles,
} from "lucide-react";
import { APP_NAME } from "@/lib/config";
import { localeOptions } from "@/lib/i18n";
import { metaIsDelayed } from "@/lib/live-status";
import { residentCopy } from "@/lib/resident-copy";
import type { Coordinates, ParkingKind } from "@/lib/resident-tools";
import { useLanguage } from "@/components/language-provider";
import { useLiveJson, type LiveJsonResult } from "@/components/use-live-json";
import type {
  BorderStatus,
  BridgeTime,
  BusEta,
  BusRoute,
  Camera,
  LearningAssistantAction,
  LrtNetwork,
  LrtNotice,
  OfficialNews,
  ParkingFacility,
  RoadCollection,
  TrafficNotice,
  WeatherSnapshot,
} from "@/lib/types";
import { CameraViewer } from "./camera-viewer";
import { MacauMap, type MapLayer } from "./macau-map";
import {
  AssistantPanel,
  CameraPanel,
  LrtPanel,
  OverviewPanel,
  SourceNote,
} from "./panels";
import { BusPanel } from "./bus-panel";
import { ParkingPanel } from "./parking-panel";
import { NoticesPanel } from "./notices-panel";
import { TravelHome } from "./travel-home";
import { JourneyPlanner } from "./journey-planner";
import { JourneyMapDetail, type SelectedJourney } from "./journey-map-detail";
import { buildJourneyMap, type JourneyMapInput } from "./journey-map";
import type { BusJourneyLeg } from "@/lib/bus-journey";
import { stopKey } from "@/lib/resident-tools";
import { useWorkspaceMotion } from "./use-workspace-motion";
import { WorkspaceNav } from "./workspace-nav";
import {
  useResidentPreferences,
  type Favorite,
} from "./use-resident-preferences";

type Tab =
  | "home"
  | "bus"
  | "parking"
  | "more"
  | "overview"
  | "lrt"
  | "notices"
  | "cameras"
  | "assistant"
  | "sources";
type SourceState = Pick<
  LiveJsonResult<unknown>,
  "data" | "meta" | "error" | "loading" | "refresh"
>;

function SourceStateNote({ state }: { state: SourceState }) {
  const { t, locale } = useLanguage();
  const c = residentCopy[locale];
  return (
    <div
      className={`workspace-source ${state.error || metaIsDelayed(state.meta) ? "has-error" : ""}`}
      role="status"
    >
      {state.loading && !state.data ? (
        <span>{t("loading")}</span>
      ) : state.error ? (
        <>
          <span>{state.data ? c.delayed : t("unavailable")}</span>
          <button type="button" onClick={state.refresh}>
            {t("retry")}
          </button>
        </>
      ) : null}
      <SourceNote meta={state.meta} />
    </div>
  );
}

export function TrafficDashboard() {
  const { locale, setLocale, t } = useLanguage();
  const c = residentCopy[locale];
  const preferences = useResidentPreferences();
  const [tab, setTab] = useState<Tab>("home");
  const requestedTab = useRef<Tab>("home");
  const [view, setView] = useState<"list" | "map">("list");
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [selectedParkingId, setSelectedParkingId] = useState<string | null>(
    null,
  );
  const [selectedNoticeId, setSelectedNoticeId] = useState<string | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<BusRoute | null>(null);
  const [busDirection, setBusDirection] = useState<0 | 1>(0);
  const [manualStopKey, setSelectedStopKey] = useState<string | null>(null);
  const [journeyBoarding, setJourneyBoarding] = useState<BusJourneyLeg | null>(null);
  const [guideMode, setGuideMode] = useState<"trip" | "brief">("trip");
  const guideModeRef = useRef<"trip" | "brief">("trip");
  const [guideTarget, setGuideTarget] = useState<HTMLDivElement | null>(null);
  const [selectedJourney, setSelectedJourney] = useState<SelectedJourney | null>(null);
  const [selectedLrtLine, setSelectedLrtLine] = useState<string | null>(null);
  const [selectedLrtStation, setSelectedLrtStation] = useState<string | null>(
    null,
  );
  const [assistantRequest, setAssistantRequest] = useState<{
    id: number;
    question: string;
  } | null>(null);
  const [assistantFocus, setAssistantFocus] =
    useState<LearningAssistantAction | null>(null);
  const [view3d, setView3d] = useState(false);
  const [layerOpen, setLayerOpen] = useState(false);
  const [layers, setLayers] = useState<Record<MapLayer, boolean>>({
    roads: true,
    cameras: false,
    lrt: false,
  });
  const [parkingKind, setParkingKind] = useState<ParkingKind>("lightVehicle");
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const [clock, setClock] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const routeCatalogScroll = useRef(0);
  const move = useWorkspaceMotion(scrollRef);
  const busVisible =
    tab === "bus" || (tab === "assistant" && assistantFocus?.kind === "bus");

  const roads = useLiveJson<RoadCollection>("/api/v1/traffic/roads", 60_000);
  const bridges = useLiveJson<BridgeTime[]>("/api/v1/traffic/bridges", 60_000);
  const cameras = useLiveJson<Camera[]>("/api/v1/cameras", 21_600_000);
  const busRoutes = useLiveJson<BusRoute[]>("/api/v1/bus/routes", 21_600_000);
  const liveRouteCodes = useMemo(() => new Set(busRoutes.data?.filter((route) => route.live).map((route) => route.routeCode)), [busRoutes.data]);
  const busEta = useLiveJson<BusEta>(
    selectedRoute
      ? `/api/v1/bus/routes/${encodeURIComponent(selectedRoute.routeCode)}/eta?direction=${busDirection}`
      : "/api/v1/health",
    2_000,
    Boolean(selectedRoute?.live) && busVisible,
  );
  const selectedStopKey = useMemo(() => {
    if (!journeyBoarding) return manualStopKey;
    if (!busEta.data || busEta.data.routeCode !== journeyBoarding.routeCode || busEta.data.direction !== journeyBoarding.direction) return null;
    const matches = busEta.data.stops.filter((stop) => stop.stationCode === journeyBoarding.from.stationCode);
    // A refreshed sequence can differ from the dated planner. Ambiguous stops
    // stay unselected so the user chooses the current boarding occurrence.
    return matches.length === 1 ? stopKey(matches[0]) : null;
  }, [journeyBoarding, busEta.data, manualStopKey]);
  const journeyLeg0 = selectedJourney?.journey.legs[0];
  const journeyLeg1 = selectedJourney?.journey.legs[1];
  const journeyEta0 = useLiveJson<BusEta>(
    journeyLeg0 ? `/api/v1/bus/routes/${encodeURIComponent(journeyLeg0.routeCode)}/eta?direction=${journeyLeg0.direction}` : "/api/v1/health",
    2_000, Boolean(journeyLeg0) && (tab === "bus" || tab === "assistant") && !selectedRoute,
  );
  const journeyEta1 = useLiveJson<BusEta>(
    journeyLeg1 ? `/api/v1/bus/routes/${encodeURIComponent(journeyLeg1.routeCode)}/eta?direction=${journeyLeg1.direction}` : "/api/v1/health",
    2_000, Boolean(journeyLeg1) && (tab === "bus" || tab === "assistant") && !selectedRoute,
  );
  // A normal background cache refresh must not remove and re-add vehicles.
  const firstPositionsFresh = Boolean(journeyEta0.meta && !metaIsDelayed(journeyEta0.meta) && !journeyEta0.error);
  const secondPositionsFresh = Boolean(journeyEta1.meta && !metaIsDelayed(journeyEta1.meta) && !journeyEta1.error);
  const journeyInput = useMemo<JourneyMapInput | null>(() => selectedJourney ? {
    id: `${selectedJourney.journey.id}:${selectedJourney.origin.join(",")}:${selectedJourney.destination.join(",")}`,
    origin: selectedJourney.origin,
    destination: selectedJourney.destination,
    destinationName: selectedJourney.destinationName,
    itineraryStops: selectedJourney.itineraryStops,
    walking: selectedJourney.journey.walking,
    legs: selectedJourney.journey.legs.map((leg, index) => ({
      leg,
      eta: index === 0 ? journeyEta0.data : journeyEta1.data,
      positionsFresh: index === 0 ? firstPositionsFresh : secondPositionsFresh,
    })),
  } : null, [selectedJourney, journeyEta0.data, journeyEta1.data, firstPositionsFresh, secondPositionsFresh]);
  const journeyGeometry = useMemo(() => journeyInput ? buildJourneyMap(journeyInput, locale) : null, [journeyInput, locale]);
  const journeyReady = selectedJourney?.journey.legs.every((leg, index) => {
    const state = index === 0 ? journeyEta0 : journeyEta1;
    return (state.data?.routeCode === leg.routeCode && state.data.direction === leg.direction) || (!state.loading && Boolean(state.error));
  }) ?? false;
  const parking = useLiveJson<ParkingFacility[]>("/api/v1/parking", 30_000);
  const weather = useLiveJson<WeatherSnapshot>("/api/v1/weather", 60_000);
  const notices = useLiveJson<TrafficNotice[]>(
    "/api/v1/traffic/notices",
    60_000,
  );
  const news = useLiveJson<OfficialNews>("/api/v1/traffic/news", 60_000);
  const borders = useLiveJson<BorderStatus[]>("/api/v1/borders", 60_000);
  const lrt = useLiveJson<LrtNetwork>("/api/v1/lrt/network", 21_600_000);
  const lrtNotices = useLiveJson<LrtNotice[]>("/api/v1/lrt/notices", 300_000);
  const mapNotices = useMemo(
    () => [...(notices.data ?? []), ...(news.data?.items ?? [])],
    [notices.data, news.data],
  );

  useLayoutEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const syncInteraction = () => {
      const panel = panelRef.current;
      const map = mapRef.current;
      if (!panel || !map) return;
      const focused = document.activeElement;
      const leaving = view === "map" ? panel : map;
      const transferFocus = media.matches && (leaving.contains(focused) || (view === "map" && selectedJourney !== null && selectedRoute === null));
      panel.inert = media.matches && view === "map";
      map.inert = media.matches && view === "list";
      if (!panel.inert) panel.ariaHidden = null;
      if (!map.inert) map.ariaHidden = null;
      if (transferFocus) {
        const target =
          view === "map"
            ? map.querySelector<HTMLElement>(".map-return")
            : panel.querySelector<HTMLElement>(
                '.view-switch [aria-pressed="true"]',
              );
        target?.focus({ preventScroll: true });
      }
      panel.ariaHidden = panel.inert ? "true" : null;
      map.ariaHidden = map.inert ? "true" : null;
    };
    syncInteraction();
    media.addEventListener("change", syncInteraction);
    return () => media.removeEventListener("change", syncInteraction);
  }, [view, selectedJourney, selectedRoute]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [tab, selectedRoute?.routeCode]);
  useEffect(() => {
    if (view !== "list") return;
    const selector =
      tab === "bus" && selectedStopKey
        ? ".waiting-card"
        : tab === "parking" && selectedParkingId
          ? ".parking-detail"
          : null;
    if (tab === "bus" && selectedStopKey)
      scrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
    else if (selector)
      scrollRef.current
        ?.querySelector(selector)
        ?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [
    selectedStopKey,
    selectedParkingId,
    tab,
    view,
    busEta.data?.routeCode,
    parking.data?.length,
  ]);

  const navigate = (next: Tab) => {
    if (!selectedStopKey) setJourneyBoarding(null);
    if (next === requestedTab.current && next === tab) {
      setView("list");
      return;
    }
    const previous = requestedTab.current;
    requestedTab.current = next;
    const order: Tab[] = [
      "home",
      "bus",
      "lrt",
      "parking",
      "assistant",
      "more",
      "overview",
      "notices",
      "cameras",
      "sources",
    ];
    move(
      () => {
        setTab(next);
        if (next === "assistant" && selectedJourney) {
          setSelectedRoute(null);
          setSelectedStopKey(null);
        }
        setView("list");
        setAssistantFocus(null);
        setLayerOpen(false);
      },
      {
        animate: next !== "assistant",
        direction:
          order.indexOf(next) < order.indexOf(previous) ? "back" : "forward",
        scrollTop: 0,
      },
    );
  };
  const locate = () => {
    setSelectedJourney(null);
    setLocationError(false);
    if (!navigator.geolocation) {
      setLocationError(true);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation([position.coords.longitude, position.coords.latitude]);
        setLocating(false);
      },
      () => {
        setLocating(false);
        setLocationError(true);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  };
  const openFavorite = (favorite: Favorite) => {
    setSelectedJourney(null);
    setJourneyBoarding(null);
    if (favorite.kind === "parking") {
      setSelectedParkingId(favorite.id);
      navigate("parking");
      return;
    }
    const route = busRoutes.data?.find(
      (item) => item.routeCode === favorite.routeCode,
    );
    if (route) {
      setSelectedRoute(route);
      setBusDirection(favorite.direction);
      setSelectedStopKey(favorite.stopKey ?? null);
      navigate("bus");
    }
  };
  const applyAssistantAction = (action: LearningAssistantAction | null) => {
    if (guideModeRef.current !== "brief") return;
    setSelectedJourney(null);
    setJourneyBoarding(null);
    if (action?.kind === "bus" && action.routeCode) {
      const route = busRoutes.data?.find(
        (item) =>
          item.routeCode.toUpperCase() === action.routeCode?.toUpperCase(),
      );
      if (!route) {
        setSelectedRoute(null);
        setAssistantFocus(null);
        busRoutes.refresh();
        return;
      }
      setSelectedRoute(route);
      setBusDirection(action.direction ?? 0);
      setSelectedStopKey(null);
    } else if (action?.kind === "lrt" && action.lineRef)
      setSelectedLrtLine(action.lineRef);
    setAssistantFocus(action);
  };
  const sources: Array<{ label: string; state: SourceState }> = [
    { label: t("roads"), state: roads },
    { label: t("bridges"), state: bridges },
    { label: t("weather"), state: weather },
    { label: t("parking"), state: parking },
    { label: t("bus"), state: busRoutes },
    ...(selectedRoute && busVisible
      ? [{ label: `${t("bus")} ${selectedRoute.routeName}`, state: busEta }]
      : []),
    { label: c.arrangements, state: notices },
    { label: c.governmentNews, state: news },
    { label: t("lrt"), state: lrt },
    { label: t("lrtNotice"), state: lrtNotices },
    { label: t("cameras"), state: cameras },
    { label: t("border"), state: borders },
  ];
  const currentSource =
    tab === "bus"
      ? selectedRoute
        ? busEta
        : busRoutes
      : tab === "parking"
        ? parking
        : tab === "lrt"
          ? lrt
          : tab === "cameras"
            ? cameras
            : null;
  const moreItems: Array<{ id: Tab; label: string; icon: typeof Activity }> = [
    { id: "overview", label: t("trafficSummary"), icon: Activity },
    { id: "lrt", label: t("lrt"), icon: TramFront },
    { id: "notices", label: c.news, icon: Bell },
    { id: "cameras", label: t("cameraTitle"), icon: Video },
    { id: "assistant", label: t("assistant"), icon: Sparkles },
    { id: "sources", label: c.sourceDetails, icon: Layers3 },
  ];
  const title =
    tab === "home"
      ? c.home
      : tab === "more"
        ? c.more
        : (moreItems.find((item) => item.id === tab)?.label ??
          t(tab as "bus" | "parking"));
  const primary = ["home", "bus", "lrt", "parking", "assistant"].includes(tab)
    ? tab
    : "more";
  const mapFocus = ["home", "more", "sources"].includes(tab)
    ? "overview"
    : (tab as
        | "overview"
        | "bus"
        | "lrt"
        | "parking"
        | "notices"
        | "cameras"
        | "assistant");
  const selectedStop = busEta.data?.stops.find(
    (stop) => `${stop.sequence}:${stop.stationCode}` === selectedStopKey,
  );

  return (
    <main
      className="resident-app"
      data-theme={preferences.theme}
      data-view={view}
      data-clock={clock}
    >
      <header className="workspace-header">
        <div className="workspace-brand">
          <Navigation size={23} aria-hidden="true" />
          <div>
            <strong>{APP_NAME}</strong>
            <span>MACAU TRANSIT</span>
          </div>
        </div>
        <WorkspaceNav selected={primary} label={t("tagline")}>
          {(
            [
              { id: "home", label: c.home, icon: Navigation },
              { id: "bus", label: t("bus"), icon: BusFront },
              { id: "lrt", label: t("lrt"), icon: TramFront },
              { id: "parking", label: t("parking"), icon: CircleParking },
              { id: "assistant", label: t("assistant"), icon: Sparkles },
            ] as const
          ).map(({ id, label, icon: Icon }, index, items) => (
            <button
              type="button"
              role="tab"
              id={`nav-${id}`}
              aria-controls="workspace-content"
              aria-selected={primary === id}
              tabIndex={primary === id ? 0 : -1}
              key={id}
              onClick={() => navigate(id)}
              onKeyDown={(event) => {
                const next =
                  event.key === "ArrowRight" || event.key === "ArrowDown"
                    ? (index + 1) % items.length
                    : event.key === "ArrowLeft" || event.key === "ArrowUp"
                      ? (index + items.length - 1) % items.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? items.length - 1
                          : null;
                if (next === null) return;
                event.preventDefault();
                navigate(items[next].id);
                document.getElementById(`nav-${items[next].id}`)?.focus();
              }}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </WorkspaceNav>
        <div className="workspace-header-actions">
          <button
            type="button"
            className="more-toggle"
            id="nav-more"
            aria-label={c.more}
            aria-pressed={primary === "more"}
            onClick={() => navigate(tab === "more" ? "home" : "more")}
          >
            <MoreHorizontal size={20} />
          </button>
          <button
            type="button"
            className="appearance-toggle"
            aria-label={c.appearance}
            onClick={() =>
              preferences.setTheme(
                preferences.theme === "light" ? "dark" : "light",
              )
            }
          >
            {preferences.theme === "light" ? (
              <Moon size={18} />
            ) : (
              <Sun size={18} />
            )}
            <span>{preferences.theme === "light" ? c.dark : c.light}</span>
          </button>
          <div className="language-switch" aria-label="Language">
            {localeOptions.map((option) => (
              <button
                type="button"
                key={option.value}
                onClick={() => setLocale(option.value)}
                aria-pressed={locale === option.value}
                className={locale === option.value ? "is-active" : ""}
              >
                {option.short}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="workspace-body">
        <aside className="workspace-panel" data-tab={tab} ref={panelRef}>
          <div className="workspace-panel-header">
            {!["home", "bus", "lrt", "parking", "assistant", "more"].includes(
              tab,
            ) ? (
              <button
                type="button"
                className="back-button"
                aria-label={c.more}
                onClick={() => navigate("more")}
              >
                <ArrowLeft size={19} />
              </button>
            ) : null}
            <h1>{title}</h1>
            <div className="view-switch" role="group" aria-label={t("mapMode")}>
              <button
                type="button"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                <List size={16} />
                {c.list}
              </button>
              <button
                type="button"
                aria-pressed={view === "map"}
                onClick={() => setView("map")}
              >
                <MapIcon size={16} />
                {c.map}
              </button>
            </div>
          </div>
          <div
            className="workspace-scroll"
            id="workspace-content"
            role="tabpanel"
            aria-labelledby={`nav-${primary}`}
            ref={scrollRef}
          >
            {locationError ? (
              <p className="data-warning" role="status">
                {c.locationFailed}
              </p>
            ) : null}
            {currentSource && !(tab === "bus" && (selectedRoute || selectedJourney)) ? (
              <SourceStateNote state={currentSource} />
            ) : null}
            {tab === "home" ? (
              <TravelHome
                favorites={preferences.favorites}
                routes={busRoutes.data}
                parking={parking.data}
                weather={weather.data}
                weatherMeta={weather.meta}
                parkingMeta={parking.meta}
                location={location}
                onLocate={locate}
                locating={locating}
                onOpen={openFavorite}
                onBus={() => navigate("bus")}
                onParking={() => navigate("parking")}
                onLrt={() => navigate("lrt")}
                onAsk={(question) => {
                  setAssistantRequest({ id: Date.now(), question });
                  navigate("assistant");
                }}
                onOverview={() => navigate("overview")}
              />
            ) : null}
            {tab === "bus" && selectedJourney && !selectedRoute ? <JourneyMapDetail
              selected={selectedJourney}
              states={selectedJourney.journey.legs.map((_, index) => index === 0 ? journeyEta0 : journeyEta1)}
              missingLegs={journeyGeometry?.missingLegs ?? []}
              uncertainTransfers={journeyGeometry?.uncertainTransfers ?? []}
              liveRouteCodes={liveRouteCodes}
              onBack={() => move(() => { setSelectedJourney(null); setView("list"); }, { direction: "back", from: ".journey-map-detail", to: ".journey-planner", focus: ".journey-planner button[type=submit]", scrollTop: 0 })}
              onMap={() => setView("map")}
              onInspect={(leg) => {
                const route = busRoutes.data?.find((entry) => entry.routeCode === leg.routeCode);
                if (!route) return;
                move(() => {
                  setSelectedRoute(route); setBusDirection(leg.direction);
                  setSelectedStopKey(null); setJourneyBoarding(leg); setView("list");
                }, { from: ".journey-map-detail", to: ".bus-route-header", focus: ".bus-route-header", scrollTop: 0 });
              }}
            /> : null}
            <div hidden={tab !== "bus" || selectedRoute !== null || selectedJourney !== null}>
              <JourneyPlanner
                enabled={tab === "bus"}
                location={location}
                locating={locating}
                locationError={locationError}
                onLocate={locate}
                liveRouteCodes={liveRouteCodes}
                onShowJourney={(journey, origin, destination, networkFetchedAt, destinationName, walkingMappedAt) => {
                  move(() => {
                    setSelectedRoute(null); setJourneyBoarding(null); setSelectedStopKey(null);
                    setSelectedJourney({ journey, origin, destination, networkFetchedAt, destinationName, walkingMappedAt });
                    setView("map");
                  }, { from: ".journey-planner", to: ".journey-map-detail", focus: ".journey-map-detail", scrollTop: 0 });
                }}
                onInspect={(leg) => {
                  const route = busRoutes.data?.find((entry) => entry.routeCode === leg.routeCode);
                  if (!route) return;
                  routeCatalogScroll.current = scrollRef.current?.scrollTop ?? 0;
                  move(() => {
                    setSelectedJourney(null);
                    setSelectedRoute(route);
                    setBusDirection(leg.direction);
                    setSelectedStopKey(null);
                    setJourneyBoarding(leg);
                  }, { from: ".journey-planner", to: ".bus-route-header", focus: ".bus-route-header", scrollTop: 0 });
                }}
              />
            </div>
            {tab === "bus" && (!selectedJourney || selectedRoute) ? (
              <BusPanel
                routes={busRoutes.data}
                selected={selectedRoute}
                backLabel={selectedJourney ? (locale === "en" ? "Back to journey" : locale === "zh-Hans" ? "返回行程" : "返回行程") : undefined}
                direction={busDirection}
                eta={busEta}
                selectedStopKey={selectedStopKey}
                onSelectStop={(key) => {
                  // Capturing the stop list while inserting the waiting card can crash Chrome.
                  move(() => {
                    setJourneyBoarding(null);
                    setSelectedStopKey(key);
                  }, {
                    animate: false,
                    focus: ".waiting-card",
                    scrollTop: 0,
                  });
                }}
                onSelect={(route) => {
                  setSelectedJourney(null);
                  setJourneyBoarding(null);
                  routeCatalogScroll.current =
                    scrollRef.current?.scrollTop ?? 0;
                  move(
                    () => {
                      setSelectedRoute(route);
                      setBusDirection(0);
                      setSelectedStopKey(null);
                    },
                    {
                      from: `[data-route-code="${CSS.escape(route.routeCode)}"]`,
                      to: ".bus-route-header",
                      focus: ".bus-route-header",
                      scrollTop: 0,
                    },
                  );
                }}
                onDirectionChange={(direction) => {
                  setJourneyBoarding(null);
                  if (direction === busDirection) return;
                  move(
                    () => {
                      setBusDirection(direction);
                      setSelectedStopKey(null);
                    },
                    { direction: direction === 0 ? "back" : "forward" },
                  );
                }}
                onBack={() => {
                  setJourneyBoarding(null);
                  if (selectedJourney) {
                    move(() => { setSelectedRoute(null); setSelectedStopKey(null); }, { direction: "back", from: ".bus-route-header", to: ".journey-map-detail", focus: ".journey-map-detail", scrollTop: 0 });
                    return;
                  }
                  const target = `[data-route-code="${CSS.escape(selectedRoute?.routeCode ?? "")}"]`;
                  move(
                    () => {
                      setSelectedRoute(null);
                      setSelectedStopKey(null);
                    },
                    {
                      direction: "back",
                      from: ".bus-route-header",
                      to: target,
                      focus: target,
                      scrollTop: routeCatalogScroll.current,
                    },
                  );
                }}
                onMap={() => setView("map")}
                isSaved={preferences.isSaved}
                onSave={preferences.toggle}
              />
            ) : null}
            {tab === "parking" ? (
              <ParkingPanel
                facilities={parking.data}
                selectedId={selectedParkingId}
                onSelect={(id) =>
                  move(() => setSelectedParkingId(id), {
                    from: `[data-parking-id="${CSS.escape(id)}"]`,
                    to: ".parking-detail",
                    focus: ".parking-detail",
                  })
                }
                kind={parkingKind}
                onKindChange={setParkingKind}
                location={location}
                onLocate={locate}
                locating={locating}
                onMap={() => setView("map")}
                isSaved={preferences.isSaved}
                onSave={preferences.toggle}
              />
            ) : null}
            {tab === "overview" ? (
              <OverviewPanel
                roads={roads.data}
                bridges={bridges.data}
                weather={weather.data}
                borders={borders.data}
                notices={notices.data}
                roadsMeta={roads.meta}
                bridgesMeta={bridges.meta}
                weatherMeta={weather.meta}
                bordersMeta={borders.meta}
              />
            ) : null}
            {tab === "lrt" ? (
              <LrtPanel
                network={lrt.data}
                notices={lrtNotices.data ?? []}
                selectedLine={selectedLrtLine}
                onSelectLine={(line) => {
                  setSelectedLrtLine(line);
                  setSelectedLrtStation(null);
                }}
                selectedStation={selectedLrtStation}
                onSelectStation={(id) => {
                  setSelectedLrtStation(id);
                  setView("map");
                }}
              />
            ) : null}
            {tab === "notices" ? (
              <NoticesPanel
                notices={notices}
                news={news}
                selectedId={selectedNoticeId}
                onSelect={(id) => {
                  setSelectedNoticeId(id);
                  setView("map");
                }}
              />
            ) : null}
            {tab === "cameras" ? (
              <CameraPanel
                cameras={cameras.data}
                selectedId={selectedCamera?.id ?? null}
                onSelect={setSelectedCamera}
              />
            ) : null}
            <div hidden={tab !== "assistant"}>
              <AssistantPanel
                request={assistantRequest}
                guideTarget={guideTarget}
                onShowGuide={() => { guideModeRef.current = "brief"; setGuideMode("brief"); setSelectedJourney(null); setView("map"); }}
                onStart={() => {
                  guideModeRef.current = "trip"; setGuideMode("trip");
                  setSelectedJourney(null); setAssistantFocus(null); setView("list");
                }}
                onJourney={(journey) => {
                  guideModeRef.current = "trip"; setGuideMode("trip");
                  setSelectedRoute(null); setAssistantFocus(null); setSelectedJourney(journey); setView("map");
                }}
                route={selectedRoute}
                direction={busDirection}
                onAction={applyAssistantAction}
                onOpenTab={(action) => {
                  navigate(action.kind === "bus" ? "bus" : "lrt");
                }}
              />
            </div>
            {tab === "more" ? (
              <div className="more-grid">
                {moreItems
                  .filter(
                    (item) => item.id !== "lrt" && item.id !== "assistant",
                  )
                  .map(({ id, label, icon: Icon }) => (
                    <button type="button" key={id} onClick={() => navigate(id)}>
                      <Icon size={21} />
                      <span>{label}</span>
                      <span aria-hidden="true">→</span>
                    </button>
                  ))}
              </div>
            ) : null}
            {tab === "sources" ? (
              <div className="source-directory">
                <p className="notice-explanation">{c.newsIntro}</p>
                {sources.map(({ label, state }) => (
                  <section key={label}>
                    <div className="section-heading">
                      <h2>{label}</h2>
                      <button
                        className="text-action"
                        type="button"
                        onClick={state.refresh}
                      >
                        {c.refresh}
                      </button>
                    </div>
                    <SourceStateNote state={state} />
                  </section>
                ))}
              </div>
            ) : null}
          </div>
        </aside>

        <div className={`workspace-map map-stage${tab === "assistant" ? " has-guide" : ""}`} ref={mapRef}>
          <MacauMap
            journey={(tab === "bus" || tab === "assistant") && !selectedRoute ? journeyInput : null}
            theme={preferences.theme}
            roads={roads.data}
            cameras={cameras.data}
            lrt={lrt.data}
            selectedLrtLine={
              tab === "lrt" || assistantFocus?.kind === "lrt"
                ? selectedLrtLine
                : null
            }
            lrtFocus={tab === "lrt" || assistantFocus?.kind === "lrt"}
            busRoute={busVisible ? busEta.data : null}
            busColor={
              busVisible ? (selectedRoute?.company.color ?? null) : null
            }
            mapFocus={mapFocus}
            parking={parking.data}
            selectedParkingId={tab === "parking" ? selectedParkingId : null}
            onParkingSelect={setSelectedParkingId}
            parkingKind={parkingKind}
            notices={mapNotices}
            selectedNoticeId={tab === "notices" ? selectedNoticeId : null}
            selectedCameraId={selectedCamera?.id ?? null}
            view3d={view3d}
            visibleLayers={layers}
            onCameraSelect={setSelectedCamera}
            selectedStopKey={selectedStopKey}
            onStopSelect={(key) => { setJourneyBoarding(null); setSelectedStopKey(key); }}
            selectedLrtStation={selectedLrtStation}
            onLrtStationSelect={setSelectedLrtStation}
          />
          <section className="assistant-guide" hidden={tab !== "assistant"} aria-label={locale === "en" ? "Travel guidance" : "出行指引"}>
            <div ref={setGuideTarget} hidden={guideMode !== "brief"} />
            {tab === "assistant" && selectedJourney ? <JourneyMapDetail
              selected={selectedJourney}
              states={selectedJourney.journey.legs.map((_, index) => index === 0 ? journeyEta0 : journeyEta1)}
              missingLegs={journeyGeometry?.missingLegs ?? []}
              uncertainTransfers={journeyGeometry?.uncertainTransfers ?? []}
              liveRouteCodes={liveRouteCodes}
              onBack={() => { setSelectedJourney(null); setView("list"); }}
              onMap={() => setView("map")}
              onInspect={(leg) => {
                const route = busRoutes.data?.find((entry) => entry.routeCode === leg.routeCode);
                if (!route) return;
                setSelectedRoute(route); setBusDirection(leg.direction); setJourneyBoarding(leg); navigate("bus");
              }}
            /> : <div className="guide-empty" hidden={guideMode === "brief"}>
              <span className="eyebrow">{locale === "en" ? "YOUR NEXT STEP" : "下一步"}</span>
              <h2>{locale === "en" ? "A route you can follow." : locale === "zh-Hans" ? "由这里出发。" : "由呢度出發。"}</h2>
              <ol>
                <li>{locale === "en" ? "Enter a destination on the left. AI will request your location and compare options." : locale === "zh-Hans" ? "在左边输入目的地。AI 会获取目前位置并比较方案；同名地点请先选择。" : "喺左邊講低目的地。AI 會取得目前位置再比較方案；同名地點請先揀選。"}</li>
                <li>{locale === "en" ? "Your walking, boarding and transfer steps will appear here." : locale === "zh-Hans" ? "这里会显示步行、上车、换乘及下车步骤。" : "呢度會顯示步行、上車、轉乘同落車步驟。"}</li>
                <li>{locale === "en" ? "Check current arrivals and stop suspensions before boarding." : locale === "zh-Hans" ? "上车前查看最新到站及停站状态。" : "上車前查看最新到站同停站狀態。"}</li>
              </ol>
            </div>}
          </section>
          <div className="workspace-map-top">
            <button
              type="button"
              className="map-return"
              onClick={() => setView("list")}
            >
              <ArrowLeft size={17} />
              {c.list}
            </button>
            <button
              type="button"
              className="quick-3d"
              aria-label="3D"
              aria-pressed={view3d}
              onClick={() => setView3d(!view3d)}
            >
              3D
            </button>
            <button
              type="button"
              className="map-settings"
              aria-expanded={layerOpen}
              aria-label={t("layers")}
              onClick={() => setLayerOpen(!layerOpen)}
            >
              <Layers3 size={18} />
              {t("layers")}
            </button>
          </div>
          {layerOpen ? (
            <div className="workspace-layer-menu">
              <div className="segmented" role="group" aria-label={t("mapMode")}>
                <button
                  type="button"
                  className={!view3d ? "is-active" : ""}
                  aria-pressed={!view3d}
                  onClick={() => setView3d(false)}
                >
                  2D
                </button>
                <button
                  type="button"
                  className={view3d ? "is-active" : ""}
                  aria-pressed={view3d}
                  onClick={() => setView3d(true)}
                >
                  3D
                </button>
              </div>
              {(["roads", "cameras", "lrt"] as const).map((layer) => (
                <label key={layer}>
                  <input
                    type="checkbox"
                    checked={layers[layer]}
                    onChange={() =>
                      setLayers((current) => ({
                        ...current,
                        [layer]: !current[layer],
                      }))
                    }
                  />
                  {t(layer)}
                </label>
              ))}
              <p>{t("unmonitoredRoads")}</p>
              <p>{c.modelsNote}</p>
            </div>
          ) : null}
          <div className="map-context">
            <span>
              {tab === "notices"
                ? c.newsIntro
                : tab === "bus" && selectedJourney && !selectedRoute
                  ? (!journeyReady
                    ? (locale === "en" ? "Checking official route geometry…" : locale === "zh-Hans" ? "正在核对官方走线…" : "正在核對官方走線…")
                    : selectedJourney.journey.walking
                      ? (locale === "en" ? "Green lines: walking paths. Dashed lines: approximate connections." : locale === "zh-Hans" ? "绿线为人行路径，虚线为端点接驳示意。" : "綠線係步行路徑，虛線係端點接駁示意。")
                      : (locale === "en" ? "Coloured lines: official bus routes. Dashed lines: approximate connections." : locale === "zh-Hans" ? "彩色线为官方巴士走线，虚线为接驳示意。" : "彩色線係官方巴士走線，虛線係接駁示意。"))
                : busVisible
                  ? t("positionNote")
                  : tab === "lrt" || assistantFocus?.kind === "lrt"
                    ? t("lrtNoLive")
                    : c.mapHint}
            </span>
            {tab === "bus" && selectedJourney?.journey.legs.length && !selectedRoute ? <span>
              {locale === "en" ? "White-centred markers: official vehicle estimates." : locale === "zh-Hans" ? "白心圆点为官方车辆估算位置。" : "白心圓點係官方車輛估算位置。"}
            </span> : null}
            {tab === "bus" && selectedJourney && !selectedRoute ? <button type="button" onClick={() => setView("list")}>
              {locale === "en" ? "View journey steps →" : locale === "zh-Hans" ? "查看行程步骤 →" : "查看行程步驟 →"}
            </button> : selectedStop && busVisible ? (
              <button type="button" onClick={() => setView("list")}>
                {selectedStop.stationName} · {c.stopView} →
              </button>
            ) : selectedParkingId && tab === "parking" ? (
              <button type="button" onClick={() => setView("list")}>
                {
                  parking.data?.find((item) => item.id === selectedParkingId)
                    ?.name
                }{" "}
                →
              </button>
            ) : null}
          </div>
        </div>
      </section>
      <CameraViewer
        camera={selectedCamera}
        onClose={() => setSelectedCamera(null)}
      />
    </main>
  );
}
