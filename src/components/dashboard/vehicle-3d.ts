import type { BusEta, LrtNetwork } from "@/lib/types";

export type VehicleLivery = "tcm" | "transmac" | "lrt-taipa" | "lrt-seacpaivan" | "lrt-hengqin";

// A real 12 m bus is only a few pixels wide at street zoom, so the display model is
// exaggerated to stay readable as a marker.
const DISPLAY_SCALE = 3.6;

// Rough liveries taken from the operators' current paint schemes:
// TCM (澳巴) orange body with a white front, Transmac (新福利) yellow body with a blue
// front, and the Macau LRT "Ocean Cruiser" in pale body with a deep blue front and an
// orange wave accent.
const LIVERIES: Record<
  VehicleLivery,
  { body: string; front: string; accent: string; glass: string }
> = {
  tcm: { body: "#e2661f", front: "#f4f6f5", accent: "#2f3437", glass: "#26303a" },
  transmac: { body: "#f3c623", front: "#1f5fa8", accent: "#24303c", glass: "#26303a" },
  "lrt-taipa": { body: "#eef4f7", front: "#14395f", accent: "#f08a24", glass: "#2c3b4a" },
  "lrt-seacpaivan": { body: "#eef4f7", front: "#4b3a76", accent: "#f08a24", glass: "#2c3b4a" },
  "lrt-hengqin": { body: "#eef4f7", front: "#8d1f2c", accent: "#f08a24", glass: "#2c3b4a" },
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
  forwardOffset = 0,
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
    offset?: number;
    base: number;
    height: number;
    color: string;
  },
): Part {
  return {
    coordinates: footprint(
      center,
      bearing,
      options.length * DISPLAY_SCALE,
      options.width * DISPLAY_SCALE,
      (options.offset ?? 0) * DISPLAY_SCALE,
    ),
    base: options.base * DISPLAY_SCALE,
    height: options.height * DISPLAY_SCALE,
    color: options.color,
  };
}

/** Rough 12 m city bus: skirt, livery body, window band, and contrasting front. */
export function busParts(
  coordinates: [number, number],
  bearing: number,
  livery: VehicleLivery,
): Part[] {
  const colors = LIVERIES[livery];

  return [
    part(coordinates, bearing, {
      length: 10.6,
      width: 2.6,
      base: 0,
      height: 0.7,
      color: colors.accent,
    }),
    part(coordinates, bearing, {
      length: 11,
      width: 2.5,
      base: 0.7,
      height: 3.1,
      color: colors.body,
    }),
    part(coordinates, bearing, {
      length: 7.4,
      width: 2.62,
      offset: -0.9,
      base: 1.9,
      height: 2.9,
      color: colors.glass,
    }),
    part(coordinates, bearing, {
      length: 1.4,
      width: 2.5,
      offset: 4.8,
      base: 0.6,
      height: 3.4,
      color: colors.front,
    }),
  ];
}

/** Rough two-car Macau LRT "Ocean Cruiser" set (about 21 m). */
export function trainParts(
  coordinates: [number, number],
  bearing: number,
  livery: VehicleLivery,
): Part[] {
  const colors = LIVERIES[livery];
  const parts: Part[] = [];

  for (const offset of [5.2, -5.2]) {
    parts.push(
      part(coordinates, bearing, {
        length: 10,
        width: 2.9,
        offset,
        base: 0.4,
        height: 3,
        color: colors.body,
      }),
      part(coordinates, bearing, {
        length: 8.2,
        width: 2.92,
        offset,
        base: 1.6,
        height: 2.7,
        color: colors.glass,
      }),
      // Orange wave stripe along the flanks.
      part(coordinates, bearing, {
        length: 10,
        width: 2.94,
        offset,
        base: 0.9,
        height: 1.15,
        color: colors.accent,
      }),
    );
  }

  parts.push(
    part(coordinates, bearing, {
      length: 1.3,
      width: 2.9,
      offset: 10.6,
      base: 0.4,
      height: 3.3,
      color: colors.front,
    }),
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

export function vehicleModelCollection(
  busRoute: BusEta | null,
  busColor: "blue" | "orange" | null,
  network: LrtNetwork | null,
  selectedLine: string | null,
): { type: "FeatureCollection"; features: VehicleModelFeature[] } {
  const features: VehicleModelFeature[] = [];
  const busLivery: VehicleLivery = busColor === "orange" ? "tcm" : "transmac";

  for (const vehicle of busRoute?.vehicles ?? []) {
    if (!vehicle.coordinates) continue;
    features.push(...toFeatures(busParts(vehicle.coordinates, vehicle.bearing ?? 0, busLivery)));
  }

  const line = network?.lines.features.find((feature) => feature.properties.ref === selectedLine);
  if (line && selectedLine) {
    const coordinates = line.geometry.coordinates as Array<[number, number]>;
    const start = coordinates[0];
    const next = coordinates[Math.min(1, coordinates.length - 1)];
    const bearing =
      ((Math.atan2(next[0] - start[0], next[1] - start[1]) * 180) / Math.PI + 360) % 360;
    const livery: VehicleLivery =
      selectedLine === "Taipa"
        ? "lrt-taipa"
        : selectedLine === "Seac Pai Van"
          ? "lrt-seacpaivan"
          : "lrt-hengqin";

    features.push(...toFeatures(trainParts(start, bearing, livery)));
  }

  return { type: "FeatureCollection", features };
}
