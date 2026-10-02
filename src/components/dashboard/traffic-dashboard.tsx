"use client";

import { useRef, useState } from "react";
import {
  Bell,
  BusFront,
  ChevronDown,
  CircleParking,
  Gauge,
  Layers3,
  TramFront,
  Video,
} from "lucide-react";
import { APP_NAME, APP_NAME_EN } from "@/lib/config";
import { localeOptions } from "@/lib/i18n";
import { useLanguage } from "@/components/language-provider";
import { useLiveJson } from "@/components/use-live-json";
import type {
  BorderStatus,
  BridgeTime,
  BusEta,
  BusRoute,
  Camera,
  LrtNetwork,
  LrtNotice,
  ParkingFacility,
  RoadCollection,
  TrafficNotice,
  WeatherSnapshot,
} from "@/lib/types";
import { CameraViewer } from "@/components/dashboard/camera-viewer";
import { MacauMap, type MapLayer } from "@/components/dashboard/macau-map";
import {
  BusPanel,
  CameraPanel,
  LrtPanel,
  NoticesPanel,
  OverviewPanel,
  ParkingPanel,
} from "@/components/dashboard/panels";

type PanelTab = "overview" | "bus" | "lrt" | "parking" | "notices" | "cameras";

const tabs: Array<{
  id: PanelTab;
  icon: typeof Gauge;
}> = [
  { id: "overview", icon: Gauge },
  { id: "bus", icon: BusFront },
  { id: "lrt", icon: TramFront },
  { id: "parking", icon: CircleParking },
  { id: "notices", icon: Bell },
  { id: "cameras", icon: Video },
];

export function TrafficDashboard() {
  const { locale, setLocale, t } = useLanguage();
  const [tab, setTab] = useState<PanelTab>("overview");
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<BusRoute | null>(null);
  const [busDirection, setBusDirection] = useState<0 | 1>(0);
  const [selectedLrtLine, setSelectedLrtLine] = useState<string | null>(null);
  const [view3d, setView3d] = useState(true);
  const [layerOpen, setLayerOpen] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const sheetStart = useRef<number | null>(null);
  const [layers, setLayers] = useState<Record<MapLayer, boolean>>({
    roads: true,
    cameras: true,
    lrt: true,
  });

  const roads = useLiveJson<RoadCollection>("/api/v1/traffic/roads", 60_000);
  const bridges = useLiveJson<BridgeTime[]>("/api/v1/traffic/bridges", 60_000);
  const cameras = useLiveJson<Camera[]>("/api/v1/cameras", 21_600_000);
  const busRoutes = useLiveJson<BusRoute[]>("/api/v1/bus/routes", 21_600_000);
  const busEtaPath = selectedRoute
    ? `/api/v1/bus/routes/${encodeURIComponent(selectedRoute.routeCode)}/eta?direction=${busDirection}`
    : "/api/v1/health";
  const busEta = useLiveJson<BusEta>(busEtaPath, 10_000, Boolean(selectedRoute));
  const parking = useLiveJson<ParkingFacility[]>("/api/v1/parking", 30_000);
  const weather = useLiveJson<WeatherSnapshot>("/api/v1/weather", 60_000);
  const notices = useLiveJson<TrafficNotice[]>("/api/v1/traffic/notices", 300_000);
  const borders = useLiveJson<BorderStatus[]>("/api/v1/borders", 60_000);
  const lrt = useLiveJson<LrtNetwork>("/api/v1/lrt/network", 86_400_000);
  const lrtNotices = useLiveJson<LrtNotice[]>("/api/v1/lrt/notices", 300_000);

  const activeMeta =
    tab === "overview"
      ? roads.meta
      : tab === "bus"
        ? busRoutes.meta
        : tab === "lrt"
          ? lrt.meta
        : tab === "parking"
          ? parking.meta
          : tab === "notices"
            ? notices.meta
            : cameras.meta;

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    sheetStart.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (sheetStart.current === null) return;
    const delta = sheetStart.current - event.clientY;
    if (delta > 45) setSheetExpanded(true);
    if (delta < -45) setSheetExpanded(false);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    sheetStart.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const panel = (
    <>
      <div className="panel-tabs" role="tablist" aria-label={t("tagline")}>
        {tabs.map(({ id, icon: Icon }) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "is-active" : ""}
            onClick={() => {
              setTab(id);
              setSheetExpanded(true);
            }}
            key={id}
          >
            <Icon size={17} aria-hidden="true" />
            <span>{t(id)}</span>
          </button>
        ))}
      </div>
      <div className="panel-scroll">
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
        {tab === "bus" ? (
          <BusPanel
            routes={busRoutes.data}
            selected={selectedRoute}
            direction={busDirection}
            eta={busEta}
            onSelect={(route) => {
              setSelectedRoute(route);
              setBusDirection(0);
            }}
            onDirectionChange={setBusDirection}
          />
        ) : null}
        {tab === "parking" ? <ParkingPanel facilities={parking.data} /> : null}
        {tab === "lrt" ? (
          <LrtPanel
            network={lrt.data}
            notices={lrtNotices.data ?? []}
            selectedLine={selectedLrtLine}
            onSelectLine={setSelectedLrtLine}
          />
        ) : null}
        {tab === "notices" ? (
          <NoticesPanel notices={notices.data ?? []} lrtNotices={lrtNotices.data ?? []} />
        ) : null}
        {tab === "cameras" ? (
          <CameraPanel cameras={cameras.data} onSelect={setSelectedCamera} />
        ) : null}
      </div>
    </>
  );

  return (
    <main className="traffic-app">
      <header className="app-header">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">
            <Gauge size={18} />
          </span>
          <div>
            <strong>{APP_NAME}</strong>
            <span>{APP_NAME_EN}</span>
          </div>
        </div>
        <div className="header-status">
          <span className={`live-dot ${activeMeta?.stale ? "is-stale" : ""}`} />
          <span>{activeMeta?.stale ? t("stale") : t("live")}</span>
          {weather.data?.temperatureCelsius != null ? (
            <strong>{weather.data.temperatureCelsius}°C</strong>
          ) : null}
        </div>
        <div className="language-switch" aria-label="Language">
          {localeOptions.map((option) => (
            <button
              type="button"
              key={option.value}
              className={locale === option.value ? "is-active" : ""}
              onClick={() => setLocale(option.value)}
              title={option.label}
            >
              {option.short}
            </button>
          ))}
        </div>
      </header>

      <section className="map-stage">
        <MacauMap
          roads={roads.data}
          cameras={cameras.data}
          lrt={lrt.data}
          selectedLrtLine={tab === "lrt" ? selectedLrtLine : null}
          busRoute={tab === "bus" ? busEta.data : null}
          busColor={tab === "bus" ? (selectedRoute?.company.color ?? null) : null}
          view3d={view3d}
          visibleLayers={layers}
          onCameraSelect={setSelectedCamera}
        />

        <div className="map-toolbar">
          <button
            type="button"
            onClick={() => setLayerOpen((current) => !current)}
            aria-expanded={layerOpen}
          >
            <Layers3 size={17} aria-hidden="true" />
            <span>{t("layers")}</span>
          </button>
          {layerOpen ? (
            <div className="layer-menu">
              {(["roads", "cameras", "lrt"] as const).map((layer) => (
                <label key={layer}>
                  <input
                    type="checkbox"
                    checked={layers[layer]}
                    onChange={() =>
                      setLayers((current) => ({ ...current, [layer]: !current[layer] }))
                    }
                  />
                  <span>{t(layer)}</span>
                </label>
              ))}
              <label>
                <input
                  type="checkbox"
                  checked={view3d}
                  onChange={() => setView3d((current) => !current)}
                />
                <span>
                  {t("view3d")} · {t("buildings")}
                </span>
              </label>
              <p className="layer-note">{t("unmonitoredRoads")}</p>
            </div>
          ) : null}
        </div>

        <aside className="desktop-panel" data-tab={tab}>
          {panel}
        </aside>

        <aside className="mobile-sheet" data-expanded={sheetExpanded}>
          <button
            type="button"
            className="sheet-grip"
            aria-label={sheetExpanded ? t("collapse") : t("expand")}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onClick={() => setSheetExpanded((current) => !current)}
          >
            <span />
            <ChevronDown size={16} aria-hidden="true" />
          </button>
          {panel}
        </aside>
      </section>

      <CameraViewer camera={selectedCamera} onClose={() => setSelectedCamera(null)} />
    </main>
  );
}
