import type { LrtNetwork } from "@/lib/types";

// Buses are drawn as Blender-rendered sprites; the LRT train stays extruded because
// no train sprite sheet exists.
export type TrainLivery = "lrt-taipa" | "lrt-seacpaivan" | "lrt-hengqin";

// A real 21 m train is only a few pixels wide at city zoom, so the display model is
// exaggerated to stay readable as a marker.
const DISPLAY_SCALE = 3.6;

// Macau LRT "Ocean Cruiser": pale body, deep blue front, orange wave stripe.
const LIVERIES: Record<TrainLivery, { body: string; accent: string; glass: string; front: string }> = {
  "lrt-taipa": { body: "#eef4f7", accent: "#f08a24", glass: "#2c3b4a", front: "#14395f" },
  "lrt-seacpaivan": { body: "#eef4f7", accent: "#f08a24", glass: "#2c3b4a", front: "#4b3a76" },
  "lrt-hengqin": { body: "#eef4f7", accent: "#f08a24", glass: "#2c3b4a", front: "#8d1f2c" },
};

function offsetPoint(
  lng: number,
  lat: number,
  sideMeters: number,
  forwardMeters: number,
  bearing: number,
): [number, number] {
  const radians = (bearing * Math.PI) / 180;
  const east = Math.sin(radians) * forwardMeters + Math.cos(radians) * sideMeters;
  const north = Math.cos(radians) * forwardMeters - Math.sin(radians) * sideMeters;
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLng = metersPerDegreeLat * Math.cos((lat * Math.PI) / 180);

  return [lng + east / metersPerDegreeLng, lat + north / metersPerDegreeLat];
}

function footprint(
  center: [number, number],
  bearing: number,
  length: number,
  width: number,
  forwardOffset: number,
): Array<[number, number]> {
  const [lng, lat] = center;
  const corners: Array<[number, number]> = [
    offsetPoint(lng, lat, -width / 2, forwardOffset + length / 2, bearing),
    offsetPoint(lng, lat, width / 2, forwardOffset + length / 2, bearing),
    offsetPoint(lng, lat, width / 2, forwardOffset - length / 2, bearing),
    offsetPoint(lng, lat, -width / 2, forwardOffset - length / 2, bearing),
  ];

  return [...corners, corners[0]];
}

interface Part {
  coordinates: Array<[number, number]>;
  base: number;
  height: number;
  color: string;
}

function part(
  center: [number, number],
  bearing: number,
  options: {
    length: number;
    width: number;
    base: number;
    height: number;
    color: string;
    forwardOffset?: number;
  },
): Part {
  const scale = DISPLAY_SCALE;

  return {
    coordinates: footprint(
      center,
      bearing,
      options.length * scale,
      options.width * scale,
      (options.forwardOffset ?? 0) * scale,
    ),
    base: options.base * scale,
    height: options.height * scale,
    color: options.color,
  };
}

/** Rough two-car Macau LRT set (about 21 m). */
export function trainParts(
  coordinates: [number, number],
  bearing: number,
  livery: TrainLivery,
): Part[] {
  const colors = LIVERIES[livery];
  const parts: Part[] = [];

  for (const offset of [5.2, -5.2]) {
    parts.push(
      part(coordinates, bearing, { length: 10, width: 2.9, base: 0.4, height: 3, color: colors.body, forwardOffset: offset }),
      part(coordinates, bearing, { length: 8.2, width: 2.92, base: 1.6, height: 2.7, color: colors.glass, forwardOffset: offset }),
      part(coordinates, bearing, { length: 10, width: 2.94, base: 0.9, height: 1.15, color: colors.accent, forwardOffset: offset }),
    );
  }

  parts.push(
    part(coordinates, bearing, { length: 1.3, width: 2.9, base: 0.4, height: 3.3, color: colors.front, forwardOffset: 10.6 }),
  );

  return parts;
}

export interface VehicleModelFeature {
  type: "Feature";
  properties: { height: number; base: number; color: string };
  geometry: { type: "Polygon"; coordinates: Array<Array<[number, number]>> };
}

function toFeatures(parts: Part[]): VehicleModelFeature[] {
  return parts.map((item) => ({
    type: "Feature" as const,
    properties: { height: item.height, base: item.base, color: item.color },
    geometry: { type: "Polygon" as const, coordinates: [item.coordinates] },
  }));
}

export function lrtTrainCollection(
  network: LrtNetwork | null,
  selectedLine: string | null,
): { type: "FeatureCollection"; features: VehicleModelFeature[] } {
  const line = network?.lines.features.find((feature) => feature.properties.ref === selectedLine);
  if (!line || !selectedLine) return { type: "FeatureCollection", features: [] };

  const coordinates = line.geometry.coordinates as Array<[number, number]>;
  const start = coordinates[0];
  const next = coordinates[Math.min(1, coordinates.length - 1)];
  const bearing =
    ((Math.atan2(next[0] - start[0], next[1] - start[1]) * 180) / Math.PI + 360) % 360;
  const livery: TrainLivery =
    selectedLine === "Taipa"
      ? "lrt-taipa"
      : selectedLine === "Seac Pai Van"
        ? "lrt-seacpaivan"
        : "lrt-hengqin";

  return { type: "FeatureCollection", features: toFeatures(trainParts(start, bearing, livery)) };
}
