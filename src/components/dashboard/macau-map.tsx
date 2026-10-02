"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
} from "maplibre-gl";
import { MACAU_BOUNDS, MACAU_CENTER } from "@/lib/config";
import type {
  BusEta,
  Camera,
  LrtNetwork,
  Locale,
  RoadCollection,
} from "@/lib/types";
import { useLanguage } from "@/components/language-provider";
import { vehicleModelCollection } from "@/components/dashboard/vehicle-3d";

export type MapLayer = "roads" | "cameras" | "lrt";

interface MacauMapProps {
  roads: RoadCollection | null;
  cameras: Camera[] | null;
  lrt: LrtNetwork | null;
  selectedLrtLine: string | null;
  busRoute: BusEta | null;
  busColor: "blue" | "orange" | null;
  view3d: boolean;
  visibleLayers: Record<MapLayer, boolean>;
  onCameraSelect: (camera: Camera) => void;
}

function createBusIcon(): { width: number; height: number; data: Uint8Array } {
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { width: size, height: size, data: new Uint8Array(size * size * 4) };

  ctx.clearRect(0, 0, size, size);

  // Ground shadow keeps the marker readable on light and dark tiles.
  ctx.fillStyle = "rgba(12, 22, 18, 0.28)";
  ctx.beginPath();
  ctx.ellipse(24, 38, 14, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Isometric bus body: roof, left flank, and front face.
  ctx.fillStyle = "#f7faf8";
  ctx.beginPath();
  ctx.moveTo(14, 13);
  ctx.lineTo(31, 8);
  ctx.lineTo(40, 14);
  ctx.lineTo(23, 19);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#e2e8e4";
  ctx.beginPath();
  ctx.moveTo(14, 13);
  ctx.lineTo(23, 19);
  ctx.lineTo(23, 32);
  ctx.lineTo(14, 26);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#cfd8d3";
  ctx.beginPath();
  ctx.moveTo(23, 19);
  ctx.lineTo(40, 14);
  ctx.lineTo(40, 27);
  ctx.lineTo(23, 32);
  ctx.closePath();
  ctx.fill();

  // Windows and front windscreen.
  ctx.fillStyle = "#243b52";
  ctx.beginPath();
  ctx.moveTo(26, 20.5);
  ctx.lineTo(31, 19);
  ctx.lineTo(31, 23.5);
  ctx.lineTo(26, 25);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(33, 18.4);
  ctx.lineTo(38, 16.8);
  ctx.lineTo(38, 21.2);
  ctx.lineTo(33, 22.8);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(17, 15.5);
  ctx.lineTo(21, 17.6);
  ctx.lineTo(21, 22.4);
  ctx.lineTo(17, 20.4);
  ctx.closePath();
  ctx.fill();

  // Wheels.
  ctx.fillStyle = "#1b2521";
  ctx.beginPath();
  ctx.ellipse(19, 27, 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(35, 25, 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  const image = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: new Uint8Array(image.data) };
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
            properties: { id: `${stop.stationCode}-${stop.sequence}`, name: stop.stationName },
            geometry: { type: "Point" as const, coordinates: stop.coordinates },
          },
        ]
      : [],
  );

  const vehicles = (busRoute?.vehicles ?? []).flatMap((vehicle) =>
    vehicle.coordinates
      ? [
          {
            type: "Feature" as const,
            properties: {
              id: vehicle.id,
              plate: vehicle.plate,
              station: vehicle.stationName,
              lowFloor: vehicle.lowFloor,
            },
            geometry: { type: "Point" as const, coordinates: vehicle.coordinates },
          },
        ]
      : [],
  );

  return {
    stations: { type: "FeatureCollection" as const, features: stations },
    vehicles: { type: "FeatureCollection" as const, features: vehicles },
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
          name: station.name[locale] || station.name["zh-Hant"],
          interchange: station.interchange,
          color: line?.properties.color ?? "#0f766e",
        },
        geometry: { type: "Point" as const, coordinates: station.coordinates },
      })),
    },
  };
}

export function MacauMap({
  roads,
  cameras,
  lrt,
  selectedLrtLine,
  busRoute,
  busColor,
  view3d,
  visibleLayers,
  onCameraSelect,
}: MacauMapProps) {
  const { locale, t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const camerasRef = useRef(cameras);
  const onCameraSelectRef = useRef(onCameraSelect);
  const view3dRef = useRef(view3d);
  const fittedRouteRef = useRef<string | null>(null);
  const fittedLrtRef = useRef<string | null>(null);

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
    let disposed = false;

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
        maxZoom: 17,
        maxPitch: 65,
        maxBounds: MACAU_BOUNDS,
        attributionControl: false,
      });

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
        map.addSource("lrt-selected-line", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addSource("lrt-selected-stations", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addSource("vehicle-3d", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        map.addSource("terrain-dem", {
          type: "raster-dem",
          tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
          encoding: "terrarium",
          tileSize: 256,
          maxzoom: 15,
          attribution: "Terrain: AWS Open Data",
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

        map.addLayer({
          id: "bus-vehicles",
          type: "circle",
          source: "bus-vehicles",
          maxzoom: 15,
          layout: { visibility: "visible" },
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 7, 15, 11],
            "circle-color": "#1d3557",
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2.2,
          },
        });

        if (!map.hasImage("bus-3d")) {
          map.addImage("bus-3d", createBusIcon(), { pixelRatio: 2 });
        }

        map.addLayer({
          id: "bus-vehicle-icons",
          type: "symbol",
          source: "bus-vehicles",
          minzoom: 11,
          maxzoom: 15,
          layout: {
            visibility: "visible",
            "icon-image": "bus-3d",
            "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.55, 15, 0.85],
            "icon-allow-overlap": true,
            "icon-rotation-alignment": "map",
            "icon-pitch-alignment": "map",
            "icon-rotate": ["coalesce", ["get", "bearing"], 0],
          },
          paint: {},
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

        map.addLayer({
          id: "vehicle-3d",
          type: "fill-extrusion",
          source: "vehicle-3d",
          minzoom: 15,
          layout: { visibility: "visible" },
          paint: {
            "fill-extrusion-color": ["get", "color"],
            "fill-extrusion-height": ["get", "height"],
            "fill-extrusion-base": ["get", "base"],
            "fill-extrusion-opacity": 0.94,
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
            minzoom: 13,
            layout: {
              visibility: "visible",
              "text-field": ["get", "plate"],
              "text-size": 10,
              "text-offset": [0, 1.5],
              "text-anchor": "top",
              "text-allow-overlap": false,
            },
            paint: {
              "text-color": "#10241d",
              "text-halo-color": "rgba(255,255,255,.9)",
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
      });

      mapRef.current = map;
    }

    void createMap();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource("roads") as GeoJSONSource | undefined;
    if (roads && source) source.setData(roads);
  }, [roads, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource("cameras") as GeoJSONSource | undefined;
    if (cameras && source) source.setData(cameraCollection(cameras));
  }, [cameras, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const { stations, vehicles, line } = busCollections(busRoute);
    const routeSource = map.getSource("bus-route") as GeoJSONSource | undefined;
    const stationSource = map.getSource("bus-stations") as GeoJSONSource | undefined;
    const vehicleSource = map.getSource("bus-vehicles") as GeoJSONSource | undefined;
    routeSource?.setData(line);
    stationSource?.setData(stations);
    vehicleSource?.setData(vehicles);

    const key = busRoute ? `${busRoute.routeCode}-${busRoute.direction}` : null;
    const points = (busRoute?.stops ?? []).flatMap((stop) =>
      stop.coordinates ? [stop.coordinates] : [],
    );
    if (key && key !== fittedRouteRef.current && points.length > 1) {
      fittedRouteRef.current = key;
      const width = map.getContainer().clientWidth;
      map.fitBounds(
        [
          [Math.min(...points.map((point) => point[0])), Math.min(...points.map((point) => point[1]))],
          [Math.max(...points.map((point) => point[0])), Math.max(...points.map((point) => point[1]))],
        ],
        {
          padding:
            width >= 1024
              ? { top: 90, right: 90, bottom: 120, left: 440 }
              : { top: 90, right: 40, bottom: 260, left: 40 },
          maxZoom: 14.5,
          duration: 900,
        },
      );
    }
    if (!key) fittedRouteRef.current = null;
  }, [busRoute, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (map.getLayer("buildings-3d")) {
      map.setLayoutProperty(
        "buildings-3d",
        "visibility",
        view3d && !busRoute ? "visible" : "none",
      );
    }
    if (map.getSource("terrain-dem")) {
      map.setTerrain(view3d ? { source: "terrain-dem", exaggeration: 1 } : null);
    }
    map.easeTo({
      pitch: view3d ? 45 : 0,
      bearing: view3d ? map.getBearing() : 0,
      duration: 700,
    });
  }, [view3d, busRoute, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer("bus-vehicles")) return;
    map.setPaintProperty(
      "bus-vehicles",
      "circle-color",
      busColor === "orange" ? "#d36822" : busColor === "blue" ? "#1d6fd0" : "#1d3557",
    );
  }, [busColor, mapReady]);

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

      if (points.length > 1) {
        fittedLrtRef.current = selectedLrtLine;
        const width = map.getContainer().clientWidth;
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
            padding:
              width >= 1024
                ? { top: 90, right: 90, bottom: 120, left: 440 }
                : { top: 90, right: 40, bottom: 260, left: 40 },
            maxZoom: 15,
            duration: 900,
          },
        );
      }
    }
    if (!selectedLrtLine) fittedLrtRef.current = null;
  }, [lrt, selectedLrtLine, locale, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource("vehicle-3d") as GeoJSONSource | undefined;
    source?.setData(vehicleModelCollection(busRoute, busColor, lrt, selectedLrtLine));
  }, [busRoute, busColor, lrt, selectedLrtLine, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const focus = Boolean(busRoute);
    const entries: Array<[string, boolean]> = [
      ["road-network", visibleLayers.roads && !focus],
      ["roads-casing", visibleLayers.roads && !focus],
      ["roads-live", visibleLayers.roads && !focus],
      ["camera-halo", visibleLayers.cameras && !focus],
      ["camera-points", visibleLayers.cameras && !focus],
      ["lrt-lines", visibleLayers.lrt && !focus],
      ["lrt-stations", visibleLayers.lrt && !focus],
      ["lrt-selected-line", !focus],
      ["lrt-selected-stations", !focus],
      ["lrt-selected-labels", !focus],
      ["bus-station-halo", focus],
      ["bus-stations", focus],
      ["bus-vehicles", focus],
      ["bus-vehicle-icons", focus],
      ["bus-station-labels", focus],
      ["bus-labels", focus],
    ];

    entries.forEach(([id, visible]) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
      }
    });
  }, [visibleLayers, busRoute, mapReady]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      role="application"
      aria-label={t("tagline")}
    />
  );
}
