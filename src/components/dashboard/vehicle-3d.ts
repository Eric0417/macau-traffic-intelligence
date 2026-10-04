import type { BusEta, LrtNetwork } from "@/lib/types";

export type VehicleLivery = "tcm" | "transmac" | "lrt-taipa" | "lrt-seacpaivan" | "lrt-hengqin";

// A real 12 m bus is only a few pixels wide at street zoom, so the display model is
// exaggerated to stay readable as a marker.
const DISPLAY_SCALE = 3.6;

// Liveries follow the operators' current paint schemes, checked against photos of
// TCM route 50/28A (orange body, white front and roof) and Transmac route 26
// (yellow body, white front, blue stripe), plus the Macau LRT "Ocean Cruiser"
// (pale body, deep blue front, orange wave).
const LIVERIES: Record<
  VehicleLivery,
  { body: string; mask: string; accent: string; glass: string; skirt: string }
> = {
  tcm: { body: "#e2661f", mask: "#f2f3f1", accent: "#e2661f", glass: "#26303a", skirt: "#1f2427" },
  transmac: {
    body: "#f2c723",
    mask: "#f2f3f1",
    accent: "#1257a8",
    glass: "#26303a",
    skirt: "#1f2427",
  },
  "lrt-taipa": { body: "#eef4f7", mask: "#eef4f7", accent: "#f08a24", glass: "#2c3b4a", skirt: "#2c3b4a" },
  "lrt-seacpaivan": { body: "#eef4f7", mask: "#eef4f7", accent: "#f08a24", glass: "#2c3b4a", skirt: "#4b3a76" },
  "lrt-hengqin": { body: "#eef4f7", mask: "#eef4f7", accent: "#f08a24", glass: "#2c3b4a", skirt: "#8d1f2c" },
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
  sideOffset: number,
  forwardOffset: number,
): Array<[number, number]> {
  const [lng, lat] = center;
  const corners: Array<[number, number]> = [
    offsetPoint(lng, lat, sideOffset - width / 2, forwardOffset + length / 2, bearing),
    offsetPoint(lng, lat, sideOffset + width / 2, forwardOffset + length / 2, bearing),
    offsetPoint(lng, lat, sideOffset + width / 2, forwardOffset - length / 2, bearing),
    offsetPoint(lng, lat, sideOffset - width / 2, forwardOffset - length / 2, bearing),
  ];

  return [...corners, corners[0]];
}

interface Part {
  coordinates: Array<[number, number]>;
  base: number;
  height: number;
  color: string;
}

interface PartOptions {
  length: number;
  width: number;
  base: number;
  height: number;
  color: string;
  sideOffset?: number;
  forwardOffset?: number;
}

function part(center: [number, number], bearing: number, options: PartOptions): Part {
  const scale = DISPLAY_SCALE;

  return {
    coordinates: footprint(
      center,
      bearing,
      options.length * scale,
      options.width * scale,
      (options.sideOffset ?? 0) * scale,
      (options.forwardOffset ?? 0) * scale,
    ),
    base: options.base * scale,
    height: options.height * scale,
    color: options.color,
  };
}

/** Rough 12 m low-floor city bus: skirt, painted body, glazing band, white roof band,
 *  contrast front, doors on the kerb side, wheels, mirrors, and a lit destination sign. */
export function busParts(
  coordinates: [number, number],
  bearing: number,
  livery: VehicleLivery,
): Part[] {
  const colors = LIVERIES[livery];
  const parts: Part[] = [];
  const half = 2.5 / 2;

  parts.push(
    part(coordinates, bearing, { length: 11.6, width: 2.3, base: 0.18, height: 0.5, color: colors.skirt }),
    part(coordinates, bearing, { length: 12, width: 2.5, base: 0.66, height: 1.34, color: colors.body }),
    part(coordinates, bearing, { length: 11.5, width: 2.54, base: 2, height: 0.95, color: colors.glass }),
    part(coordinates, bearing, { length: 12, width: 2.5, base: 2.95, height: 0.42, color: colors.mask }),
    part(coordinates, bearing, { length: 11.2, width: 2.28, base: 3.37, height: 0.14, color: colors.mask }),
    part(coordinates, bearing, { length: 2.5, width: 1.4, base: 3.5, height: 0.26, color: colors.mask, forwardOffset: -1.8 }),
    part(coordinates, bearing, { length: 0.5, width: 2.36, base: 0.66, height: 1.34, color: colors.mask, forwardOffset: 5.75 }),
    part(coordinates, bearing, { length: 0.34, width: 2.5, base: 0.3, height: 0.5, color: colors.accent, forwardOffset: 5.83 }),
    part(coordinates, bearing, { length: 0.34, width: 2.5, base: 0.3, height: 0.5, color: colors.accent, forwardOffset: -5.83 }),
    part(coordinates, bearing, { length: 0.2, width: 1.8, base: 2.98, height: 0.34, color: "#3a2f12", forwardOffset: 5.95 }),
  );

  // window mullions and the two kerb-side doorways
  for (const x of [3.5, 1.6, -0.4, -2.3, -4.2]) {
    parts.push(
      part(coordinates, bearing, { length: 0.16, width: 2.56, base: 2, height: 0.95, color: colors.mask, forwardOffset: x }),
    );
  }
  for (const x of [2.7, -1.5]) {
    parts.push(
      part(coordinates, bearing, { length: 1.05, width: 0.16, base: 0.72, height: 2.2, color: colors.glass, sideOffset: half + 0.01, forwardOffset: x }),
      part(coordinates, bearing, { length: 1.25, width: 0.1, base: 0.66, height: 2.36, color: colors.mask, sideOffset: half + 0.005, forwardOffset: x }),
    );
  }

  // wheels, lamps, mirrors
  for (const x of [3.9, -3.9]) {
    for (const side of [-1, 1]) {
      parts.push(
        part(coordinates, bearing, { length: 1.08, width: 0.36, base: 0, height: 1.06, color: "#15181a", sideOffset: side * (half - 0.1), forwardOffset: x }),
        part(coordinates, bearing, { length: 0.62, width: 0.4, base: 0.24, height: 0.58, color: "#9fa4a8", sideOffset: side * (half - 0.06), forwardOffset: x }),
      );
    }
  }
  for (const side of [-1, 1]) {
    parts.push(
      part(coordinates, bearing, { length: 0.24, width: 0.55, base: 1.05, height: 0.24, color: "#f4f4e8", sideOffset: side * 0.78, forwardOffset: 5.92 }),
      part(coordinates, bearing, { length: 0.24, width: 0.5, base: 1.1, height: 0.26, color: "#8d1f1f", sideOffset: side * 0.78, forwardOffset: -5.92 }),
      part(coordinates, bearing, { length: 0.12, width: 0.3, base: 3.05, height: 0.08, color: "#1f2427", sideOffset: side * (half + 0.12), forwardOffset: 5.4 }),
      part(coordinates, bearing, { length: 0.12, width: 0.14, base: 2.72, height: 0.5, color: "#1f2427", sideOffset: side * (half + 0.28), forwardOffset: 5.4 }),
    );
  }

  return parts;
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
      part(coordinates, bearing, { length: 10, width: 2.9, base: 0.4, height: 3, color: colors.body, forwardOffset: offset }),
      part(coordinates, bearing, { length: 8.2, width: 2.92, base: 1.6, height: 2.7, color: colors.glass, forwardOffset: offset }),
      part(coordinates, bearing, { length: 10, width: 2.94, base: 0.9, height: 1.15, color: colors.accent, forwardOffset: offset }),
    );
  }

  parts.push(
    part(coordinates, bearing, { length: 1.3, width: 2.9, base: 0.4, height: 3.3, color: colors.skirt, forwardOffset: 10.6 }),
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
