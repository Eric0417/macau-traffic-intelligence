import { describe, expect, it } from "vitest";
import {
  buildJourneyMap,
  type JourneyMapInput,
} from "@/components/dashboard/journey-map";
import type { BusJourneyLeg, BusJourneyStop } from "@/lib/bus-journey";
import type { BusEta, BusRouteSegment } from "@/lib/types";

const a = [113.54, 22.19] as [number, number];
const b = [113.542, 22.19] as [number, number];
const c = [113.544, 22.19] as [number, number];
const bend = [113.541, 22.191] as [number, number];
const stop = (code: string, coordinates: [number, number]): BusJourneyStop => ({
  stationCode: code,
  stationName: `站${code}`,
  coordinates,
});
const A = stop("A", a),
  B = stop("B", b),
  C = stop("C", c);
const leg = (
  from = A,
  to = C,
  stopCount = 2,
  routeCode = "00003",
): BusJourneyLeg => ({
  routeCode,
  routeName: routeCode === "00003" ? "3" : "8",
  direction: 0,
  circular: false,
  terminalName: to.stationName,
  from,
  to,
  fromSequence: 0,
  toSequence: stopCount,
  stopCount,
});
const segment = (
  from: string,
  to: string,
  coordinates: [number, number][],
): BusRouteSegment => ({
  fromStationCode: from,
  toStationCode: to,
  trafficStatus: "normal",
  trafficLevel: 1,
  coordinates,
});
const eta = (
  segments = [segment("A", "B", [a, bend, b]), segment("B", "C", [b, c])],
  routeCode = "00003",
): BusEta => ({
  routeCode,
  routeName: routeCode === "00003" ? "3" : "8",
  direction: 0,
  vehicles: [],
  stops: [A, B, C].map((stop, sequence) => ({
    ...stop,
    sequence,
    stopsAway: null,
    trafficStatus: "normal",
    trafficLevel: 1,
    suspended: false,
  })),
  routeSegments: segments,
  diversion: { suspendedStops: [] },
});
const journey = (
  legs: JourneyMapInput["legs"] = [{ leg: leg(), eta: eta() }],
): JourneyMapInput => ({ id: "trip", legs, origin: a, destination: c });
const buses = (result: ReturnType<typeof buildJourneyMap>) =>
  result.collection.features.filter(
    (feature) => feature.properties?.kind === "bus",
  );
const markers = (result: ReturnType<typeof buildJourneyMap>) =>
  result.collection.features.filter(
    (feature) => feature.properties?.kind === "marker",
  );

describe("journey map geometry", () => {
  it("draws only the selected official stop-to-stop shapes, including their bends", () => {
    const input = journey();
    const original = structuredClone(input);
    const result = buildJourneyMap(input);
    expect(result.missingLegs).toEqual([]);
    expect(buses(result).map((feature) => feature.geometry)).toEqual([
      { type: "LineString", coordinates: [a, bend, b] },
      { type: "LineString", coordinates: [b, c] },
    ]);
    expect(result.bounds).toContainEqual(bend);
    const board = markers(result).find(
      (feature) => feature.properties?.role === "board",
    )!;
    expect(board.properties?.label).toContain("3\n站A A");
    expect(input).toEqual(original);
  });

  it("keeps two leg colours and combines an identical-code transfer into one labelled marker", () => {
    const input = journey([
      { leg: leg(A, B, 1), eta: eta([segment("A", "B", [a, bend, b])]) },
      {
        leg: leg(B, C, 1, "00008"),
        eta: eta([segment("B", "C", [b, c])], "00008"),
      },
    ]);
    const result = buildJourneyMap(input);
    expect(
      new Set(buses(result).map((feature) => feature.properties?.color)).size,
    ).toBe(2);
    const transfers = markers(result).filter(
      (feature) => feature.properties?.role === "transfer",
    );
    expect(transfers).toHaveLength(1);
    expect(transfers[0].properties?.label).toContain("B");
    expect(transfers[0].geometry).toEqual({ type: "Point", coordinates: b });
    expect(markers(result)).toHaveLength(3);
  });

  it("omits a missing leg instead of joining station coordinates as a bus route", () => {
    const result = buildJourneyMap(journey([{ leg: leg(), eta: null }]));
    expect(result.missingLegs).toEqual([0]);
    expect(buses(result)).toEqual([]);
    expect(markers(result)).toHaveLength(2);
    expect(
      markers(result).every((feature) => feature.properties?.snapshot === true),
    ).toBe(true);
  });

  it("uses dated markers when a repeated live code has ambiguous coordinates", () => {
    const data = eta();
    data.stops.push({ ...data.stops[0], coordinates: [113.55, 22.2] });
    const result = buildJourneyMap(journey([{ leg: leg(), eta: data }]));
    const board = markers(result).find(
      (feature) => feature.properties?.role === "board",
    )!;
    expect(board.properties?.snapshot).toBe(true);
    expect(board.geometry).toEqual({ type: "Point", coordinates: a });
  });

  it("does not imply a zero-distance transfer when two live payloads disagree about the same stop", () => {
    const shifted = [113.543, 22.19] as [number, number];
    const second = eta([segment("B", "C", [shifted, c])], "00008");
    second.stops[1].coordinates = shifted;
    const result = buildJourneyMap(
      journey([
        { leg: leg(A, B, 1), eta: eta([segment("A", "B", [a, b])]) },
        { leg: leg(B, C, 1, "00008"), eta: second },
      ]),
    );
    expect(result.missingLegs).toEqual([1]);
    expect(buses(result)).toHaveLength(1);
    expect(
      markers(result).filter(
        (feature) => feature.properties?.role === "transfer",
      ),
    ).toHaveLength(1);
  });

  it("does not bridge a missing middle segment or an inconsistent coordinate join", () => {
    const missing = eta([
      segment("A", "B", [a, b]),
      segment("C", "D", [c, [113.546, 22.19]]),
    ]);
    expect(
      buildJourneyMap(journey([{ leg: leg(), eta: missing }])).missingLegs,
    ).toEqual([0]);
    const disconnected = eta([
      segment("A", "B", [a, b]),
      segment("B", "C", [[113.543, 22.19], c]),
    ]);
    expect(
      buses(buildJourneyMap(journey([{ leg: leg(), eta: disconnected }]))),
    ).toEqual([]);
  });

  it("accepts an explicit repeated-stop return segment even when the live stop list was deduplicated", () => {
    const data = eta([
      segment("A", "B", [a, b]),
      segment("B", "C", [b, c]),
      segment("C", "B", [c, b]),
    ]);
    const result = buildJourneyMap(
      journey([
        { leg: { ...leg(C, B, 1), fromSequence: 2, toSequence: 3 }, eta: data },
      ]),
    );
    expect(result.missingLegs).toEqual([]);
    expect(buses(result)[0].geometry).toEqual({
      type: "LineString",
      coordinates: [c, b],
    });
  });

  it("rejects ambiguous repeated-code alignments and wrong route/direction payloads", () => {
    const data = eta([
      segment("A", "B", [a, bend, b]),
      segment("B", "A", [b, a]),
      segment("A", "B", [a, [113.541, 22.189], b]),
    ]);
    expect(
      buildJourneyMap(journey([{ leg: leg(A, B, 1), eta: data }])).missingLegs,
    ).toEqual([0]);
    expect(
      buildJourneyMap(
        journey([{ leg: leg(), eta: { ...eta(), direction: 1 } }]),
      ).missingLegs,
    ).toEqual([0]);
    expect(
      buildJourneyMap(journey([{ leg: leg(), eta: eta(undefined, "00008") }]))
        .missingLegs,
    ).toEqual([0]);
  });

  it("marks access and egress as unverified straight connections, not walking paths", () => {
    const result = buildJourneyMap({
      ...journey(),
      origin: [113.539, 22.189],
      destination: [113.545, 22.191],
    });
    const walks = result.collection.features.filter(
      (feature) => feature.properties?.kind === "walk",
    );
    expect(walks).toHaveLength(2);
    expect(
      walks.every((feature) => feature.properties?.verified === false),
    ).toBe(true);
    expect(walks[0].geometry).toEqual({
      type: "LineString",
      coordinates: [[113.539, 22.189], a],
    });
    expect(markers(result).map((feature) => feature.properties?.role)).toEqual([
      "origin",
      "board",
      "alight",
      "destination",
    ]);
    expect(
      result.collection.features.some(
        (feature) =>
          feature.properties?.kind === "walk-label" &&
          String(feature.properties.label).includes("非步行路徑"),
      ),
    ).toBe(true);
  });
});
