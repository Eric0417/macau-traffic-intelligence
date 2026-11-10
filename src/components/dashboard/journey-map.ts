import type { BusJourneyLeg, BusJourneyStop } from "@/lib/bus-journey";
import { distanceMeters, type Coordinates } from "@/lib/resident-tools";
import type { BusEta, BusRouteSegment, Locale } from "@/lib/types";

export interface JourneyMapInput {
  id: string;
  legs: Array<{ leg: BusJourneyLeg; eta: BusEta | null }>;
  origin: Coordinates;
  destination: Coordinates;
}
export interface JourneyMapGeometry {
  collection: GeoJSON.FeatureCollection;
  missingLegs: number[];
  bounds: Coordinates[];
}
export const JOURNEY_COLORS = ["#176a96", "#bc572b"] as const;
const labels = {
  "zh-Hant": {
    origin: "起點",
    board: "上車",
    alight: "落車",
    transfer: "轉乘",
    destination: "終點",
    walk: "接駁直線（非步行路徑）",
    snapshot: "站序快照",
  },
  "zh-Hans": {
    origin: "起点",
    board: "上车",
    alight: "下车",
    transfer: "换乘",
    destination: "终点",
    walk: "接驳直线（非步行路径）",
    snapshot: "站序快照",
  },
  en: {
    origin: "Start",
    board: "Board",
    alight: "Alight",
    transfer: "Transfer",
    destination: "Destination",
    walk: "Straight connection, not a walking path",
    snapshot: "dated stop list",
  },
};

function currentStop(
  stop: BusJourneyStop,
  leg: BusJourneyLeg,
  eta: BusEta | null,
) {
  const matches =
    eta?.routeCode === leg.routeCode && eta.direction === leg.direction
      ? eta.stops.filter(
          (item) => item.stationCode === stop.stationCode && item.coordinates,
        )
      : [];
  const current = matches.length === 1 ? matches[0] : undefined;
  return {
    ...stop,
    stationName: current?.stationName ?? stop.stationName,
    coordinates: current?.coordinates ?? stop.coordinates,
    snapshot: !current,
  };
}

function legSegments(
  leg: BusJourneyLeg,
  eta: BusEta | null,
): BusRouteSegment[] | null {
  if (
    !eta ||
    eta.routeCode !== leg.routeCode ||
    eta.direction !== leg.direction ||
    leg.stopCount <= 0
  )
    return null;
  const candidates = new Map<string, BusRouteSegment[]>();
  for (
    let start = 0;
    start <= eta.routeSegments.length - leg.stopCount;
    start += 1
  ) {
    const chain = eta.routeSegments.slice(start, start + leg.stopCount);
    if (
      chain[0].fromStationCode !== leg.from.stationCode ||
      chain.at(-1)!.toStationCode !== leg.to.stationCode
    )
      continue;
    if (
      chain.some(
        (segment, index) =>
          segment.coordinates.length < 2 ||
          (index > 0 &&
            (chain[index - 1].toStationCode !== segment.fromStationCode ||
              distanceMeters(
                chain[index - 1].coordinates.at(-1)!,
                segment.coordinates[0],
              ) > 3)),
      )
    )
      continue;
    const from = currentStop(leg.from, leg, eta).coordinates;
    const to = currentStop(leg.to, leg, eta).coordinates;
    if (
      distanceMeters(chain[0].coordinates[0], from) > 25 ||
      distanceMeters(chain.at(-1)!.coordinates.at(-1)!, to) > 25
    )
      continue;
    candidates.set(
      JSON.stringify(chain.map((segment) => segment.coordinates)),
      chain,
    );
  }
  // Dated occurrence indices cannot resolve distinct repeated live alignments.
  return candidates.size === 1 ? [...candidates.values()][0] : null;
}

export function buildJourneyMap(
  journey: JourneyMapInput,
  locale: Locale = "zh-Hant",
): JourneyMapGeometry {
  const c = labels[locale];
  const features: GeoJSON.Feature[] = [];
  const missingLegs: number[] = [];
  const bounds: Coordinates[] = [journey.origin, journey.destination];
  const stops = journey.legs.map(({ leg, eta }) => ({
    from: currentStop(leg.from, leg, eta),
    to: currentStop(leg.to, leg, eta),
  }));
  const point = (
    coordinates: Coordinates,
    properties: GeoJSON.GeoJsonProperties,
  ) => {
    features.push({
      type: "Feature",
      properties,
      geometry: { type: "Point", coordinates },
    });
    bounds.push(coordinates);
  };
  const marker = (
    role: "board" | "alight" | "transfer",
    index: number,
    stop: (typeof stops)[number]["from"],
    prefix = c[role],
  ) => {
    const route = journey.legs[index].leg.routeName;
    const routeLabel =
      role === "transfer"
        ? `${route} → ${journey.legs[index + 1].leg.routeName}`
        : route;
    point(stop.coordinates, {
      kind: "marker",
      role,
      legIndex: index,
      stationCode: stop.stationCode,
      snapshot: stop.snapshot,
      color:
        role === "transfer"
          ? "#7252a3"
          : JOURNEY_COLORS[index % JOURNEY_COLORS.length],
      label: `${prefix} ${routeLabel}\n${stop.stationName} ${stop.stationCode}${stop.snapshot ? `\n(${c.snapshot})` : ""}`,
    });
  };
  const connection = (from: Coordinates, to: Coordinates) => {
    if (distanceMeters(from, to) <= 1) return;
    features.push({
      type: "Feature",
      properties: { kind: "walk", verified: false },
      geometry: { type: "LineString", coordinates: [from, to] },
    });
    point([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2], {
      kind: "walk-label",
      label: c.walk,
    });
  };
  const first = stops[0],
    last = stops.at(-1);
  const originAtBoard =
    first && distanceMeters(journey.origin, first.from.coordinates) <= 1;
  const destinationAtAlight =
    last && distanceMeters(journey.destination, last.to.coordinates) <= 1;
  if (!originAtBoard)
    point(journey.origin, {
      kind: "marker",
      role: "origin",
      color: "#233c4e",
      label: c.origin,
    });
  if (first) {
    connection(journey.origin, first.from.coordinates);
    marker(
      "board",
      0,
      first.from,
      originAtBoard ? `${c.origin} / ${c.board}` : c.board,
    );
  }
  journey.legs.forEach(({ leg, eta }, index) => {
    const transferDisagrees =
      index > 0 &&
      journey.legs[index - 1].leg.to.stationCode === leg.from.stationCode &&
      distanceMeters(
        stops[index - 1].to.coordinates,
        stops[index].from.coordinates,
      ) > 3;
    const chain = transferDisagrees ? null : legSegments(leg, eta);
    if (!chain) missingLegs.push(index);
    else
      for (const segment of chain) {
        // Keep each official shape separate. Even small source gaps are never
        // filled with an application-generated straight bus segment.
        features.push({
          type: "Feature",
          properties: {
            kind: "bus",
            legIndex: index,
            color: JOURNEY_COLORS[index % JOURNEY_COLORS.length],
            route: leg.routeName,
          },
          geometry: { type: "LineString", coordinates: segment.coordinates },
        });
        bounds.push(...segment.coordinates);
      }
    const transfer =
      journey.legs[index + 1]?.leg.from.stationCode === leg.to.stationCode;
    marker(
      transfer ? "transfer" : "alight",
      index,
      stops[index].to,
      !transfer && index === journey.legs.length - 1 && destinationAtAlight
        ? `${c.alight} / ${c.destination}`
        : c[transfer ? "transfer" : "alight"],
    );
    if (stops[index + 1] && !transfer)
      marker("board", index + 1, stops[index + 1].from);
  });
  if (last) connection(last.to.coordinates, journey.destination);
  if (!destinationAtAlight)
    point(journey.destination, {
      kind: "marker",
      role: "destination",
      color: "#233c4e",
      label: c.destination,
    });
  return {
    collection: { type: "FeatureCollection", features },
    missingLegs,
    bounds,
  };
}
