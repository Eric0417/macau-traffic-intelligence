"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  BackgroundLayerSpecification,
  FillLayerSpecification,
  LineLayerSpecification,
  SymbolLayerSpecification,
} from "maplibre-gl";
import { BUS_MODEL_MIN_ZOOM, MACAU_BOUNDS, MACAU_CENTER } from "@/lib/config";
import type {
  BusEta,
  Camera,
  LrtNetwork,
  Locale,
  ParkingFacility,
  RoadCollection,
  TrafficNotice,
} from "@/lib/types";
import { useLanguage } from "@/components/language-provider";
import type {
  Bus3DLayer as Bus3DLayerType,
  Bus3DVehicle,
  TransitLandmark,
} from "@/components/dashboard/bus-3d-layer";
import type { BusLivery } from "@/components/dashboard/bus-3d-layer";
import {
  advanceBusMotion,
  buildRoutePath,
  createBusMotion,
  pathLengths,
  pointAtDistance,
  projectOnPath,
} from "@/components/dashboard/bus-motion";
import type { BusMotion } from "@/components/dashboard/bus-motion";
import { TRANSIT_DISPLAY_SCALE, type TransitModelKind } from "./transit-display";
import { lrtTrainCollection, trainCarPoses } from "@/components/dashboard/vehicle-3d";

export type MapLayer = "roads" | "cameras" | "lrt";
export type MapFocus =
  | "overview"
  | "assistant"
  | "bus"
  | "lrt"
  | "parking"
  | "notices"
  | "cameras";

interface MacauMapProps {
  roads: RoadCollection | null;
  cameras: Camera[] | null;
  lrt: LrtNetwork | null;
  selectedLrtLine: string | null;
  lrtFocus: boolean;
  busRoute: BusEta | null;
  busColor: "blue" | "orange" | null;
  mapFocus: MapFocus;
  parking: ParkingFacility[] | null;
  selectedParkingId: string | null;
  onParkingSelect: (id: string) => void;
  notices: TrafficNotice[];
  selectedNoticeId: string | null;
  selectedCameraId: string | null;
  view3d: boolean;
  visibleLayers: Record<MapLayer, boolean>;
  onCameraSelect: (camera: Camera) => void;
  parkingKind: keyof ParkingFacility["availability"];
  selectedStopKey: string | null;
  onStopSelect: (key: string) => void;
  selectedLrtStation: string | null;
  onLrtStationSelect: (id: string) => void;
  theme: "light" | "dark";
}

function cameraCollection(cameras: Camera[]) {
  return {
    type: "FeatureCollection" as const,
    features: cameras.map((camera) => ({
      type: "Feature" as const,
      id: camera.id,
      properties: {
        id: camera.id,
        name: camera.name,
      },
      geometry: {
        type: "Point" as const,
        coordinates: camera.coordinates,
      },
    })),
  };
}

function busCollections(busRoute: BusEta | null) {
  const stations = (busRoute?.stops ?? []).flatMap((stop) =>
    stop.coordinates
      ? [
          {
            type: "Feature" as const,
            properties: { id: `${stop.sequence}:${stop.stationCode}`, name: stop.stationName },
            geometry: { type: "Point" as const, coordinates: stop.coordinates },
          },
        ]
      : [],
  );

  return {
    stations: { type: "FeatureCollection" as const, features: stations },
    line: {
      type: "FeatureCollection" as const,
      features: (busRoute?.routeSegments ?? []).map((segment) => ({
        type: "Feature" as const,
        properties: { status: segment.trafficStatus },
        geometry: {
          type: "LineString" as const,
          coordinates: segment.coordinates,
        },
      })),
    },
  };
}

function parkingTone(available: number | null): "good" | "medium" | "low" | "unknown" {
  if (available === null) return "unknown";
  if (available <= 5) return "low";
  if (available <= 20) return "medium";
  return "good";
}

function parkingFeatures(facilities: ParkingFacility[], kind: keyof ParkingFacility["availability"] = "lightVehicle") {
  return facilities.flatMap((facility) =>
    facility.coordinates
      ? [
          {
            type: "Feature" as const,
            properties: {
              id: facility.id,
              name: facility.name,
              tone: parkingTone(facility.availability[kind]),
              available: facility.availability[kind] ?? -1,
            },
            geometry: {
              type: "Point" as const,
              coordinates: facility.coordinates,
            },
          },
        ]
      : [],
  );
}

// Official notices carry a location description, not coordinates. Highlight the
// monitored road segments whose names appear in the notice text.
function noticeRoadFeatures(
  roads: RoadCollection | null,
  notice: TrafficNotice | null,
) {
  if (!roads || !notice) return [];
  const text = `${notice.title} ${notice.content}`;
  return roads.features.filter((feature) => {
    const name = feature.properties.name["zh-Hant"];
    return name.length >= 3 && text.includes(name);
  });
}

function lrtStationCoordinates(station: LrtNetwork["stations"][number], line: string | null): [number, number] {
  return line ? station.lineCoordinates?.[line] ?? station.coordinates : station.coordinates;
}

function lrtSelection(
  network: LrtNetwork | null,
  lineRef: string | null,
  locale: Locale,
) {
  const line =
    network?.lines.features.find((feature) => feature.properties.ref === lineRef) ?? null;
  const stations = (network?.stations ?? []).filter((station) =>
    lineRef ? station.lines.includes(lineRef) : false,
  );

  return {
    line: {
      type: "FeatureCollection" as const,
      features: line ? [line] : [],
    },
    stations: {
      type: "FeatureCollection" as const,
      features: stations.map((station) => ({
        type: "Feature" as const,
        properties: {
          id: station.id,
          name: station.name[locale] || station.name["zh-Hant"],
          interchange: station.interchange,
          color: line?.properties.color ?? "#0f766e",
        },
        geometry: { type: "Point" as const, coordinates: lrtStationCoordinates(station, lineRef) },
      })),
    },
  };
}

export function MacauMap({
  roads,
  cameras,
  lrt,
  selectedLrtLine,
  lrtFocus,
  busRoute,
  busColor,
  mapFocus,
  parking,
  selectedParkingId,
  onParkingSelect,
  notices,
  selectedNoticeId,
  selectedCameraId,
  view3d,
  visibleLayers,
  onCameraSelect,
  parkingKind,
  selectedStopKey,
  onStopSelect,
  selectedLrtStation,
  onLrtStationSelect,
  theme,
}: MacauMapProps) {
  const { locale, t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const basePaintRef = useRef(new Map<string, {
    type: string;
    paint: Pick<NonNullable<BackgroundLayerSpecification["paint"]>, "background-color">
      & Pick<NonNullable<FillLayerSpecification["paint"]>, "fill-color">
      & Pick<NonNullable<LineLayerSpecification["paint"]>, "line-color">
      & Pick<NonNullable<SymbolLayerSpecification["paint"]>, "text-color" | "text-halo-color">;
  }>());
  const [mapReady, setMapReady] = useState(false);
  const busHasRoute = Boolean(busRoute);
  const [readyBusModels, setReadyBusModels] = useState<TransitModelKind[]>([]);
  const bus3dReady = readyBusModels.includes(busColor === "orange" ? "tcm" : "transmac");
  const [transitLayerReady, setTransitLayerReady] = useState(false);
  const [viewportVersion, setViewportVersion] = useState(0);
  const [mapVisible, setMapVisible] = useState(true);
  const camerasRef = useRef(cameras);
  const onCameraSelectRef = useRef(onCameraSelect);
  const onParkingSelectRef = useRef(onParkingSelect);
  const onStopSelectRef = useRef(onStopSelect);
  const onLrtStationSelectRef = useRef(onLrtStationSelect);
  const view3dRef = useRef(view3d);
  const fittedRouteRef = useRef<string | null>(null);
  const fittedLrtRef = useRef<string | null>(null);
  const bus3dLayerRef = useRef<Bus3DLayerType | null>(null);
  const bus3dVehiclesRef = useRef<Bus3DVehicle[]>([]);
  const trainCarsRef = useRef<TransitLandmark[]>([]);
  const landmarksRef = useRef<TransitLandmark[]>([]);
  const busTracksRef = useRef<Map<string, BusMotion>>(new Map());
  const busRouteRef = useRef(busRoute);
  const flownParkingRef = useRef<string | null>(null);
  const flownNoticeRef = useRef<string | null>(null);
  const flownCameraRef = useRef<string | null>(null);
  const flownStopRef = useRef<string | null>(null);

  useEffect(() => { onStopSelectRef.current = onStopSelect; onLrtStationSelectRef.current = onLrtStationSelect; }, [onStopSelect, onLrtStationSelect]);

  useEffect(() => {
    view3dRef.current = view3d;
  }, [view3d]);

  useEffect(() => {
    camerasRef.current = cameras;
  }, [cameras]);

  useEffect(() => {
    onCameraSelectRef.current = onCameraSelect;
  }, [onCameraSelect]);

  useEffect(() => {
    onParkingSelectRef.current = onParkingSelect;
  }, [onParkingSelect]);

  useEffect(() => {
    busRouteRef.current = busRoute;
  }, [busRoute]);

  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | null = null;

    async function createMap() {
      const maplibre = await import("maplibre-gl");
      if (disposed || !containerRef.current || mapRef.current) return;
      maplibre.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

      const map = new maplibre.Map({
        container: containerRef.current,
        style: "https://tiles.openfreemap.org/styles/bright",
        center: MACAU_CENTER,
        zoom: 12.2,
        pitch: view3dRef.current ? 45 : 0,
        minZoom: 10.7,
        maxZoom: 24,
        maxPitch: 65,
        maxBounds: MACAU_BOUNDS,
        attributionControl: false,
        // Three.js shares this context. Antialiasing must be requested here,
        // when the canvas is created, rather than on the later renderer.
        canvasContextAttributes: { antialias: true },
        dragRotate: !window.matchMedia("(pointer: coarse)").matches,
        touchPitch: false,
      });
      map.touchZoomRotate.disableRotation();

      map.addControl(
        new maplibre.NavigationControl({ showCompass: true, visualizePitch: true }),
        "top-right",
      );
      map.addControl(
        new maplibre.AttributionControl({
          compact: true,
          customAttribution: "© OpenStreetMap contributors · OpenFreeMap",
        }),
        "bottom-right",
      );

      map.on("load", () => {
        if (!disposed) setMapReady(true);
        basePaintRef.current = new Map((map.getStyle().layers ?? []).map((layer) => [layer.id, {
          type: layer.type,
          paint: {
            "background-color": layer.type === "background" ? map.getPaintProperty(layer.id, "background-color") : undefined,
            "fill-color": layer.type === "fill" ? map.getPaintProperty(layer.id, "fill-color") : undefined,
            "line-color": layer.type === "line" ? map.getPaintProperty(layer.id, "line-color") : undefined,
            "text-color": layer.type === "symbol" ? map.getPaintProperty(layer.id, "text-color") : undefined,
            "text-halo-color": layer.type === "symbol" ? map.getPaintProperty(layer.id, "text-halo-color") : undefined,
          },
        }]));
        const firstSymbolId = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
        const hasBaseSource = Boolean(map.getSource("openmaptiles"));

        if (hasBaseSource) {
          // Full street network in grey so unmonitored roads are visible without a status claim.
          map.addLayer(
            {
              id: "road-network",
              type: "line",
              source: "openmaptiles",
              "source-layer": "transportation",
              filter: [
                "match",
                ["get", "class"],
                ["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service"],
                true,
                false,
              ],
              layout: {
                "line-cap": "round",
                "line-join": "round",
                visibility: "visible",
              },
              paint: {
                "line-color": "#b9c4bd",
                "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.6, 15, 3],
                "line-opacity": 0.85,
              },
            },
            firstSymbolId,
          );
        }

        map.addSource("lrt-lines", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addSource("lrt-stations", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addSource("roads", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addSource("cameras", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addSource("bus-stations", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addSource("bus-route", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addSource("bus-vehicles", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addSource("parking", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addSource("parking-selected", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addSource("notice-roads", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addSource("lrt-selected-line", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addSource("lrt-selected-stations", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        // The LRT train uses extruded geometry; buses use the Blender GLB layer.
        map.addSource("lrt-train-3d", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "lrt-lines",
          type: "line",
          source: "lrt-lines",
          layout: {
            "line-cap": "round",
            "line-join": "round",
            visibility: "visible",
          },
          paint: {
            "line-color": ["get", "color"],
            "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2, 15, 5],
            "line-opacity": 0.9,
          },
        });

        map.addLayer({
          id: "lrt-train-3d",
          type: "fill-extrusion",
          source: "lrt-train-3d",
          filter: ["==", ["geometry-type"], "Polygon"],
          minzoom: 12,
          layout: { visibility: "visible" },
          paint: {
            "fill-extrusion-color": ["get", "color"],
            "fill-extrusion-height": ["get", "height"],
            "fill-extrusion-base": ["get", "base"],
            "fill-extrusion-opacity": 0.94,
          },
        });

        map.addLayer({
          id: "lrt-train-label",
          type: "symbol",
          source: "lrt-train-3d",
          filter: ["==", ["geometry-type"], "Point"],
          minzoom: 12,
          layout: {
            "text-field": ["get", "label"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 11,
            "text-offset": [0, -1.8],
            "text-allow-overlap": true,
            visibility: "visible",
          },
          paint: {
            "text-color": "#0a4a35",
            "text-halo-color": "rgba(255,255,255,0.92)",
            "text-halo-width": 1.4,
          },
        });

        map.addLayer(
          {
            id: "roads-casing",
            type: "line",
            source: "roads",
            layout: {
              "line-cap": "round",
              "line-join": "round",
              visibility: "visible",
            },
            paint: {
              "line-color": "rgba(255,255,255,.92)",
              "line-width": ["interpolate", ["linear"], ["zoom"], 11, 3.5, 15, 9],
            },
          },
          firstSymbolId,
        );

        map.addLayer(
          {
            id: "roads-live",
            type: "line",
            source: "roads",
            layout: {
              "line-cap": "round",
              "line-join": "round",
              visibility: "visible",
            },
            paint: {
              "line-color": [
                "match",
                ["get", "status"],
                "normal",
                "#218a55",
                "slow",
                "#e5a915",
                "congested",
                "#d74734",
                "#7a8790",
              ],
              "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2.2, 15, 6.5],
              "line-opacity": 0.95,
            },
          },
          firstSymbolId,
        );

        map.addLayer({
          id: "lrt-stations",
          type: "circle",
          source: "lrt-stations",
          layout: { visibility: "visible" },
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 4, 15, 8],
            "circle-color": "#f7f7f2",
            "circle-stroke-color": "#24322b",
            "circle-stroke-width": 2,
          },
        });

        map.addLayer({
          id: "camera-halo",
          type: "circle",
          source: "cameras",
          layout: { visibility: "visible" },
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 7, 15, 13],
            "circle-color": "rgba(0, 132, 104, .18)",
          },
        });

        map.addLayer({
          id: "camera-points",
          type: "circle",
          source: "cameras",
          layout: { visibility: "visible" },
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 3.5, 15, 6],
            "circle-color": "#006b54",
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
          },
        });

        map.addLayer({
          id: "bus-route-line",
          type: "line",
          source: "bus-route",
          layout: {
            "line-cap": "round",
            "line-join": "round",
            visibility: "visible",
          },
          paint: {
            // Official route alignment, coloured by the official traffic level of each segment.
            "line-color": [
              "match",
              ["get", "status"],
              "normal",
              "#218a55",
              "slow",
              "#e5a915",
              "congested",
              "#d74734",
              "#8d9993",
            ],
            "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2.4, 15, 5],
            "line-opacity": 0.9,
          },
        });

        map.addLayer({
          id: "bus-station-halo",
          type: "circle",
          source: "bus-stations",
          layout: { visibility: "visible" },
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 7, 15, 12],
            "circle-color": "rgba(29, 53, 87, 0.16)",
          },
        });

        map.addLayer({
          id: "bus-stations",
          type: "circle",
          source: "bus-stations",
          layout: { visibility: "visible" },
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 4.5, 15, 7],
            "circle-color": "#ffffff",
            "circle-stroke-color": "#1d3557",
            "circle-stroke-width": 2.6,
          },
        });

        map.addLayer({ id: "bus-station-hit", type: "circle", source: "bus-stations", paint: { "circle-radius": 32, "circle-color": "rgba(0,0,0,0.001)" } });
        map.addLayer({ id: "lrt-station-hit", type: "circle", source: "lrt-stations", paint: { "circle-radius": 32, "circle-color": "rgba(0,0,0,0.001)" } });
        map.addLayer({ id: "lrt-selected-hit", type: "circle", source: "lrt-selected-stations", paint: { "circle-radius": 32, "circle-color": "rgba(0,0,0,0.001)" } });

        map.addLayer({
          id: "bus-vehicle-points",
          type: "circle",
          source: "bus-vehicles",
          // Stays visible if GLB loading fails; the 3D layer narrows it to z17.
          maxzoom: 24,
          layout: { visibility: "visible" },
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              11,
              5.5,
              14,
              7.5,
              16,
              9,
              17,
              4.5,
            ],
            "circle-color": "#1d3557",
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2.2,
          },
        });

        map.addLayer({
          id: "notice-roads",
          type: "line",
          source: "notice-roads",
          layout: {
            "line-cap": "round",
            "line-join": "round",
            visibility: "visible",
          },
          paint: {
            "line-color": "#ff9f0a",
            "line-width": ["interpolate", ["linear"], ["zoom"], 11, 3, 15, 7],
            "line-opacity": 0.95,
            "line-dasharray": [1.4, 0.8],
          },
        });

        map.addLayer({
          id: "parking-halo",
          type: "circle",
          source: "parking",
          layout: { visibility: "visible" },
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 10, 15, 15],
            "circle-color": [
              "match",
              ["get", "tone"],
              "low",
              "rgba(255, 69, 58, 0.18)",
              "medium",
              "rgba(255, 159, 10, 0.18)",
              "unknown",
              "rgba(142, 142, 147, 0.18)",
              "rgba(48, 209, 88, 0.18)",
            ],
          },
        });

        map.addLayer({
          id: "parking-points",
          type: "circle",
          source: "parking",
          layout: { visibility: "visible" },
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 5.5, 15, 9],
            "circle-color": [
              "match",
              ["get", "tone"],
              "low",
              "#ff453a",
              "medium",
              "#ff9f0a",
              "unknown",
              "#8e8e93",
              "#30d158",
            ],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        });

        map.addLayer({
          id: "parking-selected",
          type: "circle",
          source: "parking-selected",
          layout: { visibility: "visible" },
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 13, 15, 19],
            "circle-color": "rgba(10, 132, 255, 0.14)",
            "circle-stroke-color": "#0a84ff",
            "circle-stroke-width": 3,
          },
        });

        map.addLayer({
          id: "lrt-selected-line",
          type: "line",
          source: "lrt-selected-line",
          layout: {
            "line-cap": "round",
            "line-join": "round",
            visibility: "visible",
          },
          paint: {
            "line-color": ["get", "color"],
            "line-width": ["interpolate", ["linear"], ["zoom"], 11, 4, 15, 9],
            "line-opacity": 0.95,
          },
        });

        map.addLayer({
          id: "lrt-selected-stations",
          type: "circle",
          source: "lrt-selected-stations",
          layout: { visibility: "visible" },
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 5, 15, 9],
            "circle-color": "#ffffff",
            "circle-stroke-color": ["get", "color"],
            "circle-stroke-width": 2.5,
          },
        });

        if (map.getStyle().glyphs) {
          map.addLayer({
            id: "bus-station-labels",
            type: "symbol",
            source: "bus-stations",
            minzoom: 12.5,
            layout: {
              visibility: "visible",
              "text-font": ["Noto Sans Regular"],
              "text-field": ["get", "name"],
              "text-size": 10,
              "text-offset": [0, 1.1],
              "text-anchor": "top",
              "text-allow-overlap": false,
            },
            paint: {
              "text-color": "#10241d",
              "text-halo-color": "rgba(255,255,255,.92)",
              "text-halo-width": 1.4,
            },
          });

          map.addLayer({
            id: "lrt-selected-labels",
            type: "symbol",
            source: "lrt-selected-stations",
            minzoom: 11,
            layout: {
              visibility: "visible",
              "text-font": ["Noto Sans Regular"],
              "text-field": ["get", "name"],
              "text-size": 11,
              "text-offset": [0, 1.15],
              "text-anchor": "top",
              "text-allow-overlap": false,
            },
            paint: {
              "text-color": "#13201a",
              "text-halo-color": "rgba(255,255,255,.94)",
              "text-halo-width": 1.5,
            },
          });

          map.addLayer({
            id: "bus-labels",
            type: "symbol",
            source: "bus-vehicles",
            minzoom: 11,
            layout: {
              visibility: "visible",
              "text-font": ["Noto Sans Regular"],
              "text-field": ["get", "plate"],
              "text-size": 11,
              "text-offset": [0, 1.7],
              "text-anchor": "top",
              "text-allow-overlap": true,
              "text-ignore-placement": true,
            },
            paint: {
              "text-color": "#10241d",
              "text-halo-color": "rgba(255,255,255,.9)",
              "text-halo-width": 1.4,
            },
          });

          map.addLayer({
            id: "parking-labels",
            type: "symbol",
            source: "parking",
            minzoom: 12.5,
            layout: {
              visibility: "visible",
              "text-font": ["Noto Sans Regular"],
              "text-field": ["get", "name"],
              "text-size": 11,
              "text-offset": [0, -1.6],
              "text-anchor": "bottom",
              "text-allow-overlap": false,
            },
            paint: {
              "text-color": "#10241d",
              "text-halo-color": "rgba(255,255,255,.92)",
              "text-halo-width": 1.4,
            },
          });
        }

        if (hasBaseSource) {
          map.addLayer({
            id: "buildings-3d",
            type: "fill-extrusion",
            source: "openmaptiles",
            "source-layer": "building",
            minzoom: 13,
            layout: { visibility: "none" },
            paint: {
              "fill-extrusion-color": [
                "interpolate",
                ["linear"],
                ["coalesce", ["get", "render_height"], 10],
                0,
                "#dfe3e0",
                40,
                "#c6ccc9",
                120,
                "#aab3b0",
              ],
              "fill-extrusion-height": ["coalesce", ["get", "render_height"], 10],
              "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
              "fill-extrusion-opacity": 0.85,
            },
          });
        }

        map.on("mouseenter", "camera-points", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "camera-points", () => {
          map.getCanvas().style.cursor = "";
        });
        map.on("click", "camera-points", (event) => {
          const id = String(event.features?.[0]?.properties?.id ?? "");
          const camera = camerasRef.current?.find((item) => item.id === id);
          if (camera) onCameraSelectRef.current(camera);
        });
        map.on("mouseenter", "parking-points", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "parking-points", () => {
          map.getCanvas().style.cursor = "";
        });
        map.on("click", "parking-points", (event) => {
          const id = String(event.features?.[0]?.properties?.id ?? "");
          if (id) onParkingSelectRef.current(id);
        });
        map.on("click", "bus-station-hit", (event) => {
          const id = String(event.features?.[0]?.properties?.id ?? "");
          if (id) onStopSelectRef.current(id);
        });
        for (const layer of ["lrt-station-hit", "lrt-selected-hit"]) {
          map.on("click", layer, (event) => {
            const id = String(event.features?.[0]?.properties?.id ?? "");
            if (id) onLrtStationSelectRef.current(id);
          });
        }
      });

      mapRef.current = map;
      observer = new ResizeObserver(() => {
        if (disposed) return;
        const visible = Boolean(containerRef.current?.clientWidth && containerRef.current?.clientHeight);
        setMapVisible(visible);
        if (!visible) return;
        map.resize();
        fittedRouteRef.current = null;
        fittedLrtRef.current = null;
        setViewportVersion((version) => version + 1);
      });
      observer.observe(containerRef.current);
    }

    void createMap();
    return () => {
      disposed = true;
      observer?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !view3d || bus3dLayerRef.current) return;
    let cancelled = false;
    void import("@/components/dashboard/bus-3d-layer").then(({ Bus3DLayer }) => {
      if (cancelled || map.getLayer("bus-3d")) return;
      const layer = new Bus3DLayer((kind) => setReadyBusModels((current) => current.includes(kind) ? current : [...current, kind]));
      bus3dLayerRef.current = layer;
      map.addLayer(layer, map.getLayer("bus-labels") ? "bus-labels" : undefined);
      layer.setVehicles(bus3dVehiclesRef.current);
      layer.setLandmarks(landmarksRef.current);
      layer.setTrainCars(trainCarsRef.current);
      layer.setVisible(true);
      setTransitLayerReady(true);
    }).catch((error: unknown) => console.error("Transit 3D layer failed to load", error));
    return () => { cancelled = true; };
  }, [mapReady, view3d]);

  useEffect(() => {
    const landmarks: TransitLandmark[] = busRoute ? busRoute.stops.flatMap((stop) => stop.coordinates ? [{ id: `stop:${stop.sequence}:${stop.stationCode}`, coordinates: stop.coordinates, bearing: 0, model: "bus-stop" as const, selected: `${stop.sequence}:${stop.stationCode}` === selectedStopKey }] : [])
      : lrt && (lrtFocus || ((mapFocus === "overview" || mapFocus === "assistant") && visibleLayers.lrt)) ? lrt.stations.filter((station) => !selectedLrtLine || station.lines.includes(selectedLrtLine)).map((station) => {
        const line = lrt.lines.features.find((item) => item.properties.ref === (selectedLrtLine ?? station.lines[0]));
        const path = line?.geometry.coordinates as Array<[number, number]> | undefined;
        const lengths = path ? pathLengths(path) : [];
        const coordinates = lrtStationCoordinates(station, selectedLrtLine ?? station.lines[0]);
        const bearing = path?.length ? pointAtDistance(path, lengths, projectOnPath(path, lengths, coordinates)).bearing : 0;
        return { id: `lrt:${station.id}`, coordinates, bearing, model: "lrt-platform" as const, selected: station.id === selectedLrtStation };
      }) : [];
    landmarksRef.current = landmarks;
    bus3dLayerRef.current?.setLandmarks(landmarks);
  }, [busRoute, lrt, lrtFocus, mapFocus, selectedLrtLine, visibleLayers.lrt, transitLayerReady, selectedStopKey, selectedLrtStation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource("roads") as GeoJSONSource | undefined;
    if (roads && source) source.setData(roads);
  }, [roads, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const properties = ["background-color", "fill-color", "line-color", "text-color", "text-halo-color"] as const;
    for (const [id, original] of basePaintRef.current) {
      if (!map.getLayer(id)) continue;
      const colors: Partial<Record<typeof properties[number], string>> = original.type === "background" ? { "background-color": "#15232b" }
        : original.type === "fill" ? { "fill-color": /water/.test(id) ? "#193d4c" : /park|wood|landcover/.test(id) ? "#243b35" : /building/.test(id) ? "#35454d" : "#1c2d35" }
        : original.type === "line" ? { "line-color": /water/.test(id) ? "#2e535f" : "#627781" }
        : original.type === "symbol" ? { "text-color": "#d5e0e5", "text-halo-color": "#17242c" } : {};
      for (const property of properties) {
        const color = colors[property];
        if (color) map.setPaintProperty(id, property, theme === "dark" ? color : original.paint[property]);
      }
    }
  }, [theme, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource("cameras") as GeoJSONSource | undefined;
    if (cameras && source) source.setData(cameraCollection(cameras));
  }, [cameras, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer("bus-vehicle-points")) return;
    const useModels = view3d && bus3dReady;
    // GLB models replace the flat marker at street zoom in 3D mode. In 2D mode
    // the enlarged, livery-coloured marker stays visible at every zoom.
    map.setLayerZoomRange("bus-vehicle-points", 10.7, useModels ? BUS_MODEL_MIN_ZOOM - .01 : 24);
    map.setPaintProperty(
      "bus-vehicle-points",
      "circle-color",
      busColor === "orange" ? "#e2761b" : "#1d5fa8",
    );
    map.setPaintProperty(
      "bus-vehicle-points",
      "circle-radius",
      useModels
        ? ["interpolate", ["linear"], ["zoom"], 11, 5.5, 14, 7.5, 16, 9, 17, 4.5]
        : ["interpolate", ["linear"], ["zoom"], 11, 7, 13, 9, 15, 12, 17, 13],
    );
  }, [bus3dReady, busColor, view3d, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const { stations, line } = busCollections(busRoute);
    const routeSource = map.getSource("bus-route") as GeoJSONSource | undefined;
    const stationSource = map.getSource("bus-stations") as GeoJSONSource | undefined;
    routeSource?.setData(line);
    stationSource?.setData(stations);
    bus3dLayerRef.current?.setVisible(view3d && (Boolean(busRoute) || lrtFocus));

    const key = busRoute ? `${busRoute.routeCode}-${busRoute.direction}` : null;
    const points = (busRoute?.stops ?? []).flatMap((stop) =>
      stop.coordinates ? [stop.coordinates] : [],
    );
    if (key && key !== fittedRouteRef.current && points.length > 1 && !selectedStopKey) {
      fittedRouteRef.current = key;
      map.fitBounds(
        [
          [Math.min(...points.map((point) => point[0])), Math.min(...points.map((point) => point[1]))],
          [Math.max(...points.map((point) => point[0])), Math.max(...points.map((point) => point[1]))],
        ],
        {
          padding: { top: 72, right: 32, bottom: 120, left: 32 },
          maxZoom: 14.5,
          duration: 900,
        },
      );
    }
    if (!key) fittedRouteRef.current = null;
  }, [busRoute, view3d, lrtFocus, mapReady, viewportVersion, selectedStopKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const vehicleSource = map.getSource("bus-vehicles") as GeoJSONSource | undefined;
    const livery: BusLivery = busColor === "orange" ? "tcm" : "transmac";

    let lastSourceUpdate = 0;
    const renderStates = (
      states: ReturnType<typeof advanceBusMotion>[],
      forceSource: boolean,
    ) => {
      bus3dVehiclesRef.current = states.map((state) => ({
        id: state.id,
        coordinates: state.coordinates,
        bearing: state.bearing,
        livery: state.livery,
      }));
      if (view3d) {
        bus3dLayerRef.current?.setVehicles(bus3dVehiclesRef.current);
      }
      const timestamp = Date.now();
      if (!vehicleSource || (!forceSource && timestamp - lastSourceUpdate < 120)) return;
      lastSourceUpdate = timestamp;
      vehicleSource.setData({
        type: "FeatureCollection",
        features: states.map((state) => ({
          type: "Feature",
          properties: {
            id: state.id,
            plate: state.plate,
            station: state.stationName,
            lowFloor: state.lowFloor,
          },
          geometry: { type: "Point", coordinates: state.coordinates },
        })),
      });
    };

    if (!busRoute) {
      busTracksRef.current.clear();
      renderStates([], true);
      return;
    }

    const routeKey = `${busRoute.routeCode}-${busRoute.direction}`;
    const route = buildRoutePath(busRoute.routeSegments);
    const now = Date.now();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const previousTracks = busTracksRef.current;
    const tracks = new Map<string, BusMotion>();
    for (const vehicle of busRoute.vehicles) {
      const motion = createBusMotion(
        vehicle,
        route,
        routeKey,
        livery,
        now,
        reducedMotion ? null : previousTracks.get(vehicle.id) ?? null,
      );
      if (motion) tracks.set(vehicle.id, motion);
    }
    busTracksRef.current = tracks;
    const motions = [...tracks.values()];

    renderStates(
      motions.map((motion) => advanceBusMotion(motion, now)),
      true,
    );

    const moving = () => motions.some((motion) => motion.distance !== motion.target || motion.speed !== 0);
    if (reducedMotion || !mapVisible || !moving()) return;
    let frame = 0;
    let disposed = false;
    let lastFrame = 0;
    const frameInterval = window.matchMedia("(pointer: coarse)").matches ? 1000 / 30 : 1000 / 60;
    // Glide each bus toward the newest official estimate along the official
    // polyline. Corrections are speed-limited, so a coarse ETA step changes
    // direction or distance smoothly instead of teleporting the marker.
    const tick = () => {
      frame = 0;
      if (disposed) return;
      if (document.visibilityState !== "visible") return;
      const timestamp = Date.now();
      if (timestamp - lastFrame < frameInterval) { frame = window.requestAnimationFrame(tick); return; }
      lastFrame = timestamp;
      renderStates(
        motions.map((motion) => advanceBusMotion(motion, timestamp)),
        false,
      );
      if (moving()) frame = window.requestAnimationFrame(tick);
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") {
        window.cancelAnimationFrame(frame);
        frame = 0;
      } else if (!frame && moving()) frame = window.requestAnimationFrame(tick);
    };
    document.addEventListener("visibilitychange", onVisibility);
    frame = window.requestAnimationFrame(tick);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [busRoute, busColor, mapReady, view3d, mapVisible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource("parking") as GeoJSONSource | undefined;
    const selectedSource = map.getSource("parking-selected") as GeoJSONSource | undefined;
    const features = parkingFeatures(parking ?? [], parkingKind);
    source?.setData({ type: "FeatureCollection", features });
    selectedSource?.setData({
      type: "FeatureCollection",
      features: features.filter(
        (feature) => feature.properties.id === selectedParkingId,
      ),
    });

    const facility = selectedParkingId
      ? (parking ?? []).find((item) => item.id === selectedParkingId)
      : null;
    if (facility?.coordinates && selectedParkingId !== flownParkingRef.current) {
      flownParkingRef.current = selectedParkingId;
      map.flyTo({
        center: facility.coordinates,
        zoom: Math.max(map.getZoom(), 15.5),
        duration: 700,
      });
    }
    if (!selectedParkingId) flownParkingRef.current = null;
  }, [parking, selectedParkingId, parkingKind, mapReady, viewportVersion]);



  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource("notice-roads") as GeoJSONSource | undefined;
    if (!source) return;
    const notice = selectedNoticeId
      ? notices.find((item) => item.id === selectedNoticeId) ?? null
      : null;
    const features = noticeRoadFeatures(roads, notice);
    source.setData({ type: "FeatureCollection", features });

    if (
      notice &&
      features.length &&
      selectedNoticeId !== flownNoticeRef.current
    ) {
      flownNoticeRef.current = selectedNoticeId;
      const coordinates = features.flatMap((feature) => feature.geometry.coordinates);
      map.fitBounds(
        [
          [
            Math.min(...coordinates.map((point) => point[0])),
            Math.min(...coordinates.map((point) => point[1])),
          ],
          [
            Math.max(...coordinates.map((point) => point[0])),
            Math.max(...coordinates.map((point) => point[1])),
          ],
        ],
        { padding: 90, maxZoom: 15, duration: 700 },
      );
    }
    if (!selectedNoticeId) flownNoticeRef.current = null;
  }, [roads, notices, selectedNoticeId, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !selectedCameraId) return;
    const camera = cameras?.find((item) => item.id === selectedCameraId);
    if (camera && selectedCameraId !== flownCameraRef.current) {
      flownCameraRef.current = selectedCameraId;
      map.flyTo({
        center: camera.coordinates,
        zoom: Math.max(map.getZoom(), 14.5),
        duration: 700,
      });
    }
    if (!selectedCameraId) flownCameraRef.current = null;
  }, [cameras, selectedCameraId, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (map.getLayer("buildings-3d")) {
      map.setLayoutProperty(
        "buildings-3d",
        "visibility",
        view3d &&
          !busHasRoute &&
          !lrtFocus &&
          (mapFocus === "overview" || mapFocus === "assistant")
          ? "visible"
          : "none",
      );
    }
    // The ground stays flat: no terrain elevation is applied, so roads are not
    // bent by the DEM. The 3D toggle only tilts the camera and shows buildings.
    map.setTerrain(null);
    const pitch = view3d ? 45 : 0;
    const bearing = view3d ? map.getBearing() : 0;
    // An unchanged camera mode must not cancel a route or parking selection flight.
    if (Math.abs(map.getPitch() - pitch) > .1 || Math.abs(map.getBearing() - bearing) > .1) {
      map.easeTo({ pitch, bearing, duration: 700 });
    }
  }, [view3d, busHasRoute, lrtFocus, mapFocus, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const stop = busRoute?.stops.find((item) => `${item.sequence}:${item.stationCode}` === selectedStopKey);
    if (map.getLayer("bus-station-halo")) map.setPaintProperty("bus-station-halo", "circle-color", ["case", ["==", ["get", "id"], selectedStopKey ?? ""], "rgba(20,108,148,.5)", "rgba(20,108,148,.12)"]);
    const key = stop ? `${busRoute?.routeCode}:${busRoute?.direction}:${selectedStopKey}:${view3d}:${viewportVersion}` : null;
    if (stop?.coordinates && key !== flownStopRef.current) {
      flownStopRef.current = key;
      map.flyTo({ center: stop.coordinates, zoom: view3d ? 17.8 : 16, pitch: view3d ? 45 : 0, duration: 500 });
    }
    if (!stop) flownStopRef.current = null;
  }, [busRoute, selectedStopKey, mapReady, viewportVersion, view3d]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !lrt) return;
    const lines = map.getSource("lrt-lines") as GeoJSONSource | undefined;
    const stations = map.getSource("lrt-stations") as GeoJSONSource | undefined;
    lines?.setData(lrt.lines);
    stations?.setData({
      type: "FeatureCollection",
      features: lrt.stations.map((station) => ({
        type: "Feature" as const,
        properties: {
          id: station.id,
          name: station.name[locale],
          interchange: station.interchange,
        },
        geometry: {
          type: "Point" as const,
          coordinates: station.coordinates,
        },
      })),
    });
  }, [lrt, locale, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const { line, stations } = lrtSelection(lrt, selectedLrtLine, locale);
    const lineSource = map.getSource("lrt-selected-line") as GeoJSONSource | undefined;
    const stationSource = map.getSource("lrt-selected-stations") as GeoJSONSource | undefined;
    lineSource?.setData(line);
    stationSource?.setData(stations);

    if (selectedLrtLine && selectedLrtLine !== fittedLrtRef.current) {
      const geometry = lrt?.lines.features.find(
        (feature) => feature.properties.ref === selectedLrtLine,
      )?.geometry.coordinates;
      const points: Array<[number, number]> = [
        ...((geometry ?? []) as Array<[number, number]>),
        ...(lrt?.stations ?? [])
          .filter((station) => station.lines.includes(selectedLrtLine))
          .map((station) => station.coordinates),
      ];

      if (points.length > 1 && !selectedLrtStation) {
        fittedLrtRef.current = selectedLrtLine;
        map.fitBounds(
          [
            [
              Math.min(...points.map((point) => point[0])),
              Math.min(...points.map((point) => point[1])),
            ],
            [
              Math.max(...points.map((point) => point[0])),
              Math.max(...points.map((point) => point[1])),
            ],
          ],
          {
            padding: { top: 72, right: 32, bottom: 120, left: 32 },
            maxZoom: 15,
            duration: 900,
          },
        );
      }
    }
    if (!selectedLrtLine) fittedLrtRef.current = null;
  }, [lrt, selectedLrtLine, locale, mapReady, selectedLrtStation, viewportVersion]);

  useEffect(() => {
    const map = mapRef.current;
    const station = lrt?.stations.find((item) => item.id === selectedLrtStation);
    if (map && mapReady && station && lrtFocus) map.flyTo({ center: lrtStationCoordinates(station, selectedLrtLine), zoom: view3d ? 16.8 : 15.5, pitch: view3d ? 45 : 0, duration: 500 });
  }, [lrt, selectedLrtStation, selectedLrtLine, lrtFocus, view3d, mapReady, viewportVersion]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource("lrt-train-3d") as GeoJSONSource | undefined;
    if (!source) return;

    const line = lrt?.lines.features.find(
      (feature) => feature.properties.ref === selectedLrtLine,
    );
    if (!line || !selectedLrtLine) {
      source.setData({ type: "FeatureCollection", features: [] });
      trainCarsRef.current = [];
      bus3dLayerRef.current?.setTrainCars([]);
      return;
    }

    const path = line.geometry.coordinates as Array<[number, number]>;
    const lengths = pathLengths(path);
    const total = lengths.at(-1) ?? 0;
    const speed = 35 / 3.6;
    const startedAt = Date.now();
    const station = lrt?.stations.find((item) => item.id === selectedLrtStation);
    const start = station ? projectOnPath(path, lengths, lrtStationCoordinates(station, selectedLrtLine)) : 0;
    const schematicLabel = t("lrtSchematic");
    const draw = (distance: number) => {
      const point = pointAtDistance(path, lengths, distance);
      const scale = TRANSIT_DISPLAY_SCALE;
      const cars = trainCarPoses(path, distance, 10.8 * scale);
      trainCarsRef.current = cars.map((car, index) => ({ id: `train:${selectedLrtLine}:${index}`, model: "lrt-car", coordinates: car.coordinates, bearing: (car.bearing + (index === 1 ? 180 : 0)) % 360 }));
      bus3dLayerRef.current?.setTrainCars(view3d ? trainCarsRef.current : []);
      source.setData(lrtTrainCollection(lrt, selectedLrtLine, { ...point, cars, scale }, schematicLabel));
    };
    draw(start);
    if (!mapVisible || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let lastUpdate = 0;
    let disposed = false;
    const tick = () => {
      if (disposed) return;
      const now = Date.now();
      if (document.visibilityState === "visible" && now - lastUpdate > 100) {
        lastUpdate = now;
        const progress = total > 0 ? (start + speed * (now - startedAt) / 1000) % (2 * total) : 0;
        draw(progress > total ? 2 * total - progress : progress);
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => { disposed = true; window.cancelAnimationFrame(frame); };
  }, [lrt, selectedLrtLine, selectedLrtStation, locale, mapReady, mapVisible, view3d, transitLayerReady, t]);

  useEffect(() => {
    const map = mapRef.current;
    if (mapReady && map?.getLayer("lrt-train-3d")) map.setLayerZoomRange("lrt-train-3d", 12, view3d && readyBusModels.includes("lrt-car") ? 11.99 : 24);
  }, [mapReady, view3d, readyBusModels]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const busFocus = Boolean(busRoute);
    const lrtOnly = lrtFocus && !busFocus;
    const parkingFocus = mapFocus === "parking" && !busFocus;
    const camerasFocus = mapFocus === "cameras" && !busFocus;
    const noticesFocus = mapFocus === "notices" && !busFocus;
    // Each tab shows its own subject. Overview and the assistant keep the
    // general map; every other tab narrows the map to that module.
    const baseFocus =
      (mapFocus === "overview" || mapFocus === "assistant") && !busFocus && !lrtOnly;
    const showTrain =
      !busFocus &&
      (lrtOnly
        ? Boolean(selectedLrtLine) || visibleLayers.lrt
        : baseFocus && visibleLayers.lrt);
    const entries: Array<[string, boolean]> = [
      ["road-network", baseFocus && visibleLayers.roads],
      ["roads-casing", baseFocus && visibleLayers.roads],
      ["roads-live", baseFocus && visibleLayers.roads],
      ["camera-halo", camerasFocus || (baseFocus && visibleLayers.cameras)],
      ["camera-points", camerasFocus || (baseFocus && visibleLayers.cameras)],
      ["lrt-lines", lrtOnly ? !selectedLrtLine : baseFocus && visibleLayers.lrt],
      ["lrt-stations", lrtOnly ? !selectedLrtLine : baseFocus && visibleLayers.lrt],
      ["lrt-station-hit", lrtOnly ? !selectedLrtLine : baseFocus && visibleLayers.lrt],
      ["lrt-selected-hit", !busFocus && Boolean(selectedLrtLine)],
      ["lrt-selected-line", !busFocus && Boolean(selectedLrtLine)],
      ["lrt-selected-stations", !busFocus && Boolean(selectedLrtLine)],
      ["lrt-selected-labels", !busFocus && Boolean(selectedLrtLine)],
      ["lrt-train-3d", showTrain],
      ["lrt-train-label", showTrain],
      ["notice-roads", noticesFocus && Boolean(selectedNoticeId)],
      ["parking-halo", parkingFocus],
      ["parking-points", parkingFocus],
      ["parking-selected", parkingFocus && Boolean(selectedParkingId)],
      ["parking-labels", parkingFocus],
      ["bus-station-halo", busFocus],
      ["bus-stations", busFocus],
      ["bus-station-hit", busFocus],
      ["bus-vehicle-points", busFocus],
      ["bus-station-labels", busFocus],
      ["bus-labels", busFocus],
    ];

    entries.forEach(([id, visible]) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
      }
    });
    bus3dLayerRef.current?.setVisible(view3d && (busFocus || lrtOnly || (baseFocus && visibleLayers.lrt)));
  }, [
    visibleLayers,
    busRoute,
    selectedLrtLine,
    selectedParkingId,
    selectedNoticeId,
    lrtFocus,
    mapFocus,
    mapReady,
    view3d,
    transitLayerReady,
  ]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      role="application"
      aria-label={t("tagline")}
    >
      {!mapReady ? <div className="map-loading" role="status">{t("loading")}</div> : null}
    </div>
  );
}
