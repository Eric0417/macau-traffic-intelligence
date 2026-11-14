import type { BusJourney, BusJourneyLeg, BusJourneyStop } from "@/lib/bus-journey";
import { distanceMeters, type Coordinates } from "@/lib/resident-tools";
import type { BusEta, BusRouteSegment, Locale } from "@/lib/types";
import { walkingPathBetween, type WalkingPath } from "@/lib/walking-network";

export interface JourneyMapInput {
  id: string;
  legs: Array<{ leg: BusJourneyLeg; eta: BusEta | null; positionsFresh?: boolean }>;
  origin: Coordinates;
  destination: Coordinates;
  destinationName?: string;
  walking?: BusJourney["walking"];
}
export interface JourneyMapGeometry {
  collection: GeoJSON.FeatureCollection;
  missingLegs: number[];
  uncertainTransfers: number[];
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
  const exact = new Map<string, BusRouteSegment[]>();
  const updated = new Map<string, BusRouteSegment[]>();
  const from = currentStop(leg.from, leg, eta).coordinates;
  const to = currentStop(leg.to, leg, eta).coordinates;
  const segments = eta.routeSegments;
  for (let start = 0; start < segments.length; start += 1) {
    const first = segments[start];
    if (first.fromStationCode !== leg.from.stationCode ||
        !first.coordinates[0] || distanceMeters(first.coordinates[0], from) > 25) continue;
    for (let end = start; end < segments.length; end += 1) {
      const segment = segments[end];
      const previous = end > start ? segments[end - 1] : null;
      if (segment.coordinates.length < 2 ||
          (previous && (previous.toStationCode !== segment.fromStationCode ||
            distanceMeters(previous.coordinates.at(-1)!, segment.coordinates[0]) > 25))) break;
      if (segment.toStationCode !== leg.to.stationCode ||
          distanceMeters(segment.coordinates.at(-1)!, to) > 25) continue;
      const chain = segments.slice(start, end + 1);
      const candidates = chain.length === leg.stopCount ? exact : updated;
      candidates.set(JSON.stringify(chain.map((item) => item.coordinates)), chain);
    }
  }
  // A stop can be added or skipped since the snapshot. A changed chain is
  // usable when there is only one matching alignment in the current feed.
  const candidates = exact.size ? exact : updated;
  return candidates.size === 1 ? [...candidates.values()][0] : null;
}

export function buildJourneyMap(
  journey: JourneyMapInput,
  locale: Locale = "zh-Hant",
): JourneyMapGeometry {
  const c = labels[locale];
  const features: GeoJSON.Feature[] = [];
  const missingLegs: number[] = [];
  const uncertainTransfers: number[] = [];
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
  const straightLink = (from: Coordinates, to: Coordinates) => {
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
  const connection = (from: Coordinates, to: Coordinates, planned?: WalkingPath) => {
    const path = walkingPathBetween(planned, from, to);
    if (!path) {
      straightLink(from, to);
      return;
    }
    features.push({
      type: "Feature",
      properties: { kind: "walking-path" },
      geometry: { type: "LineString", coordinates: path.coordinates },
    });
    for (const coordinate of path.coordinates) bounds.push(coordinate);
    straightLink(from, path.coordinates[0]);
    straightLink(path.coordinates.at(-1)!, to);
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
    connection(journey.origin, first.from.coordinates, journey.walking?.access);
    marker(
      "board",
      0,
      first.from,
      originAtBoard ? `${c.origin} / ${c.board}` : c.board,
    );
  }
  journey.legs.forEach(({ leg, eta }, index) => {
    const chain = legSegments(leg, eta);
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
            width: journey.legs.length > 1 && index === 0 ? 9 : 5,
            route: leg.routeName,
          },
          geometry: { type: "LineString", coordinates: segment.coordinates },
        });
        bounds.push(...segment.coordinates);
      }
    const sameStop =
      journey.legs[index + 1]?.leg.from.stationCode === leg.to.stationCode;
    const transfer = sameStop && distanceMeters(stops[index].to.coordinates, stops[index + 1].from.coordinates) <= 3;
    if (sameStop && !transfer) uncertainTransfers.push(index + 1);
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
    if (eta?.routeCode === leg.routeCode && eta.direction === leg.direction && journey.legs[index].positionsFresh) {
      for (const vehicle of eta.vehicles) {
        if (vehicle.positionSource !== "feed" || !vehicle.coordinates) continue;
        // Vehicle locations do not pull the camera away from the planned ride.
        features.push({
          type: "Feature",
          properties: {
            kind: "vehicle",
            legIndex: index,
            color: JOURNEY_COLORS[index % JOURNEY_COLORS.length],
            label: [leg.routeName, vehicle.plate].filter(Boolean).join(" · "),
          },
          geometry: { type: "Point", coordinates: vehicle.coordinates },
        });
      }
    }
  });
  if (last) connection(last.to.coordinates, journey.destination, journey.walking?.egress);
  if (journey.walking?.direct) connection(journey.origin, journey.destination, journey.walking.direct);
  if (!destinationAtAlight)
    point(journey.destination, {
      kind: "marker",
      role: "destination",
      color: "#233c4e",
      label: journey.destinationName ? `${c.destination}\n${journey.destinationName}` : c.destination,
    });
  return {
    collection: { type: "FeatureCollection", features },
    missingLegs,
    uncertainTransfers,
    bounds,
  };
}
