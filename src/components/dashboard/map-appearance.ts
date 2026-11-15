import type { ExpressionSpecification, LayerSpecification, Map as MapLibreMap } from "maplibre-gl";
import { JOURNEY_COLORS } from "./journey-map";

const palettes = {
  light: {
    ground: "#eceef0", land: "#eaebec", park: "#dbe4da", water: "#d5e1ee",
    building: "#d4d8dd", tallBuilding: "#a6aeb7", road: "#fdfdfd",
    casing: "#cfd3d8", path: "#c1c7ce", boundary: "#a3b1c2",
    text: "#4e5560", place: "#282c32", waterLabel: "#42576e", halo: "#f7f8fa",
  },
  dark: {
    ground: "#222325", land: "#27282b", park: "#2c3330", water: "#19232e",
    building: "#363a40", tallBuilding: "#515964", road: "#444850",
    casing: "#2c3035", path: "#38404a", boundary: "#495a70",
    text: "#c2c7ce", place: "#eff1f5", waterLabel: "#9faec2", halo: "#222325",
  },
} as const;

export function setBaseMapLabels(map: MapLibreMap, baseLayers: LayerSpecification[], busFocused: boolean) {
  for (const layer of baseLayers) {
    if (layer.type !== "symbol") continue;
    // Keep POIs and road shields at neighbourhood zoom on the general map.
    if (layer["source-layer"] === "poi" || /shield/.test(layer.id)) {
      map.setLayerZoomRange(layer.id, Math.max(15, layer.minzoom ?? 0), layer.maxzoom ?? map.getMaxZoom());
    }
    map.setLayoutProperty(layer.id, "visibility", busFocused ? "none" : (layer.layout?.visibility ?? "visible"));
  }
}

export function applyMapAppearance(map: MapLibreMap, baseLayers: LayerSpecification[], theme: keyof typeof palettes) {
  const palette = palettes[theme];
  for (const layer of baseLayers) {
    const { id, type } = layer;
    if (type === "background") {
      map.setPaintProperty(id, "background-color", palette.ground);
    } else if (type === "fill") {
      const color = /^water/.test(id) ? palette.water
        : /park|wood|grass/.test(id) ? palette.park
          : /^building/.test(id) ? palette.building
            : palette.land;
      map.setPaintProperty(id, "fill-color", color);
      if (layer.paint?.["fill-outline-color"]) {
        map.setPaintProperty(id, "fill-outline-color", color);
      }
    } else if (type === "line") {
      const color = /^water/.test(id) ? palette.water
        : /^boundary|^ferry/.test(id) ? palette.boundary
          : /casing/.test(id) ? palette.casing
            : /path|railway|cablecar/.test(id) ? palette.path
              : palette.road;
      map.setPaintProperty(id, "line-color", color);
    } else if (type === "symbol" && layer.layout?.["text-field"]) {
      const color = /^water/.test(id) ? palette.waterLabel : /^label_/.test(id) ? palette.place : palette.text;
      map.setPaintProperty(id, "text-color", color);
      map.setPaintProperty(id, "text-halo-color", palette.halo);
    }
  }

  if (map.getLayer("road-network")) map.setPaintProperty("road-network", "line-color", palette.road);
  if (map.getLayer("buildings-3d")) {
    map.setPaintProperty("buildings-3d", "fill-extrusion-color", [
      "interpolate", ["linear"], ["coalesce", ["get", "render_height"], 10],
      0, palette.building, 120, palette.tallBuilding,
    ]);
  }

  const night = theme === "dark";
  const routeColor: ExpressionSpecification = night
    ? ["match", ["get", "color"], JOURNEY_COLORS[0], "#67baff", JOURNEY_COLORS[1], "#ffa571", ["get", "color"]]
    : ["get", "color"];
  map.setPaintProperty("journey-bus-lines", "line-color", routeColor);
  map.setPaintProperty("journey-bus-casing", "line-color", night ? routeColor : "#ffffff");
  map.setPaintProperty("journey-bus-casing", "line-width", ["+", ["number", ["get", "width"]], night ? 10 : 4]);
  map.setPaintProperty("journey-bus-casing", "line-blur", night ? 4 : 0);
  map.setPaintProperty("journey-bus-casing", "line-opacity", night ? .48 : .95);
  map.setPaintProperty("journey-walking-paths", "line-color", night ? "#69dbb6" : "#21885f");
  map.setPaintProperty("journey-walk-lines", "line-color", night ? "#a5b9d9" : "#637e8c");
  for (const id of ["journey-marker-labels", "journey-walk-labels", "bus-station-labels", "bus-labels"]) {
    if (!map.getLayer(id)) continue;
    map.setPaintProperty(id, "text-color", palette.place);
    map.setPaintProperty(id, "text-halo-color", palette.halo);
  }
}

export function addJourneyEndpointIcons(map: MapLibreMap) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 72;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.scale(2, 2);

  ctx.beginPath();
  ctx.arc(18, 18, 17, 0, Math.PI * 2);
  ctx.fillStyle = "#389cf34d";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(18, 18, 11, 0, Math.PI * 2);
  ctx.fillStyle = "#217de5";
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.fill(new Path2D("M 14 12 L 24 18 L 18.5 19 L 16 24 Z"));
  map.addImage("journey-origin", ctx.getImageData(0, 0, 72, 72), { pixelRatio: 2 });

  ctx.clearRect(0, 0, 36, 36);
  const pin = new Path2D("M 18 35 C 15 30 7 22 7 15 A 11 11 0 0 1 29 15 C 29 22 21 30 18 35 Z");
  ctx.fillStyle = "#c43f3a";
  ctx.fill(pin);
  ctx.stroke(pin);
  ctx.beginPath();
  ctx.arc(18, 15, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  map.addImage("journey-destination", ctx.getImageData(0, 0, 72, 72), { pixelRatio: 2 });
  return true;
}
