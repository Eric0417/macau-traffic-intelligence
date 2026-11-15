"use strict";
var NativePlanner = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // ios/Planner/bridge.ts
  var bridge_exports = {};
  __export(bridge_exports, {
    configure: () => configure,
    geometry: () => geometry,
    plan: () => plan,
    search: () => search
  });

  // src/lib/resident-tools.ts
  function distanceMeters(a, b) {
    const radians = Math.PI / 180;
    const dLat = (b[1] - a[1]) * radians;
    const dLng = (b[0] - a[0]) * radians;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * Math.sin(dLng / 2) ** 2;
    return 6371e3 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // src/lib/bus-journey.ts
  var BUS_JOURNEY_ACCESS_METERS = 1e3;
  var MAX_BUS_LEGS = 4;
  var MAX_JOURNEYS = 6;
  function coversDeparture(windows, minute) {
    return windows.some(
      ([start, end]) => start <= end ? minute >= start && minute <= end : minute >= start || minute <= end
    );
  }
  function uniqueStops(network) {
    const stops = /* @__PURE__ */ new Map();
    for (const route of network.routes) for (const stop of route.stops) {
      if (!stops.has(stop.stationCode)) stops.set(stop.stationCode, stop);
    }
    return [...stops.values()];
  }
  function searchBusStops(network, query) {
    const needle = query.trim().toLocaleUpperCase();
    if (!needle) return [];
    return uniqueStops(network).filter(
      (stop) => stop.stationCode.toLocaleUpperCase().includes(needle) || stop.stationName.toLocaleUpperCase().includes(needle)
    ).sort((a, b) => Number(b.stationCode === needle) - Number(a.stationCode === needle) || a.stationCode.localeCompare(b.stationCode, "en", { numeric: true })).slice(0, 30);
  }
  function endpointStops(network, endpoint, includeNearbyStops, walk) {
    const paths = /* @__PURE__ */ new Map();
    if ("stationCode" in endpoint && !includeNearbyStops) {
      return { distances: /* @__PURE__ */ new Map([[endpoint.stationCode.trim().toUpperCase(), 0]]), paths };
    }
    const stops = uniqueStops(network);
    const coordinates = "coordinates" in endpoint ? endpoint.coordinates : stops.find((stop) => stop.stationCode === endpoint.stationCode.trim().toUpperCase())?.coordinates;
    const distances = /* @__PURE__ */ new Map();
    if (!coordinates) return { distances, paths };
    for (const stop of stops) {
      const distance = distanceMeters(coordinates, stop.coordinates);
      if (distance > BUS_JOURNEY_ACCESS_METERS) continue;
      if (!walk || distance <= 1) {
        distances.set(stop.stationCode, Math.round(distance));
        continue;
      }
      const path = walk(stop.coordinates);
      if (!path || path.meters > 1e3) continue;
      distances.set(stop.stationCode, path.meters);
      paths.set(stop.stationCode, path);
    }
    return { distances, paths };
  }
  function leg(route, from, to) {
    return {
      routeCode: route.routeCode,
      routeName: route.routeName,
      direction: route.direction,
      terminalName: route.stops.at(-1).stationName,
      circular: route.circular,
      from: route.stops[from],
      to: route.stops[to],
      fromSequence: from,
      toSequence: to,
      stopCount: to - from,
      serviceWindows: route.serviceWindows
    };
  }
  function planBusJourneys(network, origin, destination, options = {}) {
    const { distances: starts, paths: accessPaths } = endpointStops(network, origin, options.includeNearbyStops ?? false, options.walking?.access);
    const { distances: ends, paths: egressPaths } = endpointStops(network, destination, options.includeNearbyStops ?? false, options.walking?.egress);
    const hasHours = (plan2) => plan2.legs.every((item) => item.serviceWindows);
    const score = (plan2) => plan2.totalStops + (plan2.accessMeters + plan2.egressMeters) / 100 + Math.max(0, plan2.legs.length - 1) * 6;
    const compare = (a, b) => (options.departureMinute === void 0 ? 0 : Number(hasHours(b)) - Number(hasHours(a))) || score(a) - score(b) || a.legs.length - b.legs.length || a.id.localeCompare(b.id, "en", { numeric: true });
    const departures = /* @__PURE__ */ new Map();
    for (const route of network.routes) {
      if (options.departureMinute !== void 0 && route.serviceWindows && !coversDeparture(route.serviceWindows, options.departureMinute)) continue;
      for (let from = 0; from < route.stops.length - 1; from++) {
        const station = route.stops[from].stationCode;
        if (options.unavailableStops?.get(route.routeName)?.has(station)) continue;
        const legs = departures.get(station) ?? [];
        for (let to = from + 1; to < route.stops.length; to++) {
          if (route.stops[to].stationCode === station || options.unavailableStops?.get(route.routeName)?.has(route.stops[to].stationCode)) continue;
          legs.push(leg(route, from, to));
        }
        departures.set(station, legs);
      }
    }
    let frontier = /* @__PURE__ */ new Map();
    for (const [station, accessMeters] of starts) {
      frontier.set(station, [{ id: "", legs: [], accessMeters, egressMeters: 0, transferMeters: 0, totalStops: 0 }]);
    }
    const plans = [];
    for (let round = 0; round < MAX_BUS_LEGS && frontier.size; round++) {
      const next = /* @__PURE__ */ new Map();
      for (const [station, arrivals] of frontier) {
        for (const arrival of arrivals) for (const item of departures.get(station) ?? []) {
          if (arrival.legs.at(-1)?.routeCode === item.routeCode) continue;
          const plan2 = {
            id: `${arrival.id ? `${arrival.id}|` : ""}${item.routeCode}:${item.direction}:${item.fromSequence}-${item.toSequence}`,
            legs: [...arrival.legs, item],
            accessMeters: arrival.accessMeters,
            egressMeters: 0,
            transferMeters: 0,
            totalStops: arrival.totalStops + item.stopCount
          };
          const end = item.to.stationCode;
          const egress = ends.get(end);
          if (egress !== void 0 && plan2.legs[0].from.stationCode !== end && new Set(plan2.legs.map((l) => l.routeCode)).size === plan2.legs.length) {
            plans.push({ ...plan2, egressMeters: egress });
          }
          const labels2 = next.get(end) ?? /* @__PURE__ */ new Map();
          const key = `${item.routeCode}:${Number(hasHours(plan2))}`;
          const previous = labels2.get(key);
          if (!previous || compare(plan2, previous) < 0) labels2.set(key, plan2);
          next.set(end, labels2);
        }
      }
      frontier = new Map([...next].map(([station, labels2]) => [station, [...labels2.values()]]));
    }
    plans.sort(compare);
    const seen = /* @__PURE__ */ new Set();
    const distinct = plans.filter((plan2) => {
      const buses = plan2.legs.map((item) => `${item.routeCode}:${item.direction}`).join("|");
      const key = buses;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const selected = [];
    for (const plan2 of distinct) {
      if (selected.some((other) => {
        if (other.legs.length >= plan2.legs.length || other.totalStops > plan2.totalStops || other.accessMeters > plan2.accessMeters || other.egressMeters > plan2.egressMeters) return false;
        let index = 0;
        for (const item of plan2.legs) if (item.routeCode === other.legs[index]?.routeCode && item.direction === other.legs[index]?.direction) index++;
        return index === other.legs.length;
      })) continue;
      selected.push(plan2);
      if (selected.length === MAX_JOURNEYS) break;
    }
    const direct = distinct.find((plan2) => plan2.legs.length === 1);
    if (direct && !selected.some((plan2) => plan2.legs.length === 1)) selected[selected.length - 1] = direct;
    return selected.map((plan2) => {
      if (!options.walking) return plan2;
      const access = accessPaths.get(plan2.legs[0].from.stationCode);
      const egress = egressPaths.get(plan2.legs.at(-1).to.stationCode);
      return { ...plan2, walking: { access, egress } };
    });
  }

  // src/lib/walking-network.ts
  function walkingPathBetween(path, from, to) {
    return path && distanceMeters(path.from, from) <= 3 && distanceMeters(path.to, to) <= 3 ? path : void 0;
  }
  var normalize = (name) => name.normalize("NFKD").toLowerCase().replace(/[\p{M}\s\p{P}]/gu, "");
  function searchJourneyPlaces(places, query) {
    const needle = normalize(query);
    if (!needle) return [];
    const matches = places.flatMap((place) => {
      const names = [place.name, ...place.aliases].map(normalize);
      const rank = names.includes(needle) ? 0 : names.some((name) => name.startsWith(needle)) ? 1 : names.some((name) => name.includes(needle)) ? 2 : -1;
      return rank < 0 ? [] : [{ place, rank }];
    });
    matches.sort((a, b) => a.rank - b.rank || Number(Boolean(a.place.street)) - Number(Boolean(b.place.street)) || a.place.name.length - b.place.name.length);
    const results = [];
    for (const { place } of matches) {
      if (results.some((match) => match.name === place.name && distanceMeters(match.coordinates, place.coordinates) < 75)) continue;
      results.push(place);
      if (results.length === 6) break;
    }
    return results;
  }
  var MinQueue = class {
    constructor() {
      this.items = [];
    }
    push(item) {
      const heap = this.items;
      let index = heap.length;
      heap.push(item);
      while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (heap[parent][0] <= item[0]) break;
        heap[index] = heap[parent];
        index = parent;
      }
      heap[index] = item;
    }
    pop() {
      const heap = this.items;
      const first = heap[0];
      const last = heap.pop();
      if (!heap.length || !last) return first;
      let index = 0;
      while (index * 2 + 1 < heap.length) {
        let child = index * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1][0] < heap[child][0]) child++;
        if (heap[child][0] >= last[0]) break;
        heap[index] = heap[child];
        index = child;
      }
      heap[index] = last;
      return first;
    }
  };
  var MAX_SNAP_METERS = 55;
  var longitudeScale = Math.cos(22.16 * Math.PI / 180);
  var searchRadius = MAX_SNAP_METERS / 1e5;
  function createWalkingRouter({ nodes, edges }) {
    const lengths = edges.map(([a, b]) => distanceMeters(nodes[a], nodes[b]));
    const outgoing = nodes.map(() => []);
    const incoming = nodes.map(() => []);
    const parents = Int32Array.from(nodes, (_, index) => index);
    const sizes = new Int32Array(nodes.length).fill(1);
    function component(node) {
      while (parents[node] !== node) {
        parents[node] = parents[parents[node]];
        node = parents[node];
      }
      return node;
    }
    edges.forEach(([a, b, direction], index) => {
      let first = component(a), second = component(b);
      if (first !== second) {
        if (sizes[first] < sizes[second]) [first, second] = [second, first];
        parents[second] = first;
        sizes[first] += sizes[second];
      }
      if (direction !== 2) {
        outgoing[a].push([b, lengths[index]]);
        incoming[b].push([a, lengths[index]]);
      }
      if (direction !== 1) {
        outgoing[b].push([a, lengths[index]]);
        incoming[a].push([b, lengths[index]]);
      }
    });
    const largest = sizes.reduce((best, size, node) => size > sizes[best] ? node : best, 0);
    function snap(coordinates) {
      let best = null;
      let bestOnMain = null;
      for (let edge = 0; edge < edges.length; edge++) {
        const [a, b, , canSnap] = edges[edge];
        if (!canSnap) continue;
        const start = nodes[a], end = nodes[b];
        const [x, y] = coordinates;
        if (x < Math.min(start[0], end[0]) - searchRadius || x > Math.max(start[0], end[0]) + searchRadius || y < Math.min(start[1], end[1]) - searchRadius || y > Math.max(start[1], end[1]) + searchRadius) continue;
        const dx = end[0] - start[0], dy = end[1] - start[1];
        const scaleSquared = longitudeScale ** 2;
        const lengthSquared = dx * dx * scaleSquared + dy * dy;
        if (!lengthSquared) continue;
        const fraction = Math.min(1, Math.max(
          0,
          ((x - start[0]) * dx * scaleSquared + (y - start[1]) * dy) / lengthSquared
        ));
        const point = [start[0] + fraction * dx, start[1] + fraction * dy];
        const gap = distanceMeters(coordinates, point);
        if (gap > MAX_SNAP_METERS) continue;
        const candidate = { edge, point, fraction, gap };
        if (!best || gap < best.gap) best = candidate;
        if (component(a) === largest && (!bestOnMain || gap < bestOnMain.gap)) bestOnMain = candidate;
      }
      return bestOnMain ?? best;
    }
    function endpoints(point, reverse) {
      const [a, b, direction] = edges[point.edge];
      const length = lengths[point.edge];
      const ends = [];
      if (point.fraction === 0 || direction === 0 || direction === (reverse ? 1 : 2)) {
        ends.push([point.fraction * length, a]);
      }
      if (point.fraction === 1 || direction === 0 || direction === (reverse ? 2 : 1)) {
        ends.push([(1 - point.fraction) * length, b]);
      }
      return ends;
    }
    return (root, reverse = false) => {
      const start = snap(root);
      if (!start) return () => null;
      const links = reverse ? incoming : outgoing;
      const distance = new Float64Array(nodes.length).fill(Infinity);
      const previous = new Int32Array(nodes.length).fill(-1);
      const queue = new MinQueue();
      for (const [meters, node] of endpoints(start, reverse)) {
        distance[node] = meters;
        queue.push([meters, node]);
      }
      for (let item = queue.pop(); item; item = queue.pop()) {
        const [meters, node] = item;
        if (distance[node] !== meters) continue;
        for (const [next, length] of links[node]) {
          const nextDistance = meters + length;
          if (nextDistance >= distance[next]) continue;
          distance[next] = nextDistance;
          previous[next] = node;
          queue.push([nextDistance, next]);
        }
      }
      return (target) => {
        const end = snap(target);
        if (!end) return null;
        let best = Infinity;
        let last = -1;
        if (start.edge === end.edge) {
          const delta = end.fraction - start.fraction;
          const direction = edges[start.edge][2];
          if (direction === 0 || delta === 0 || direction === (delta > 0 !== reverse ? 1 : 2)) {
            best = Math.abs(delta) * lengths[start.edge];
          }
        }
        for (const [meters, node] of endpoints(end, !reverse)) {
          if (meters + distance[node] < best) {
            best = meters + distance[node];
            last = node;
          }
        }
        if (!Number.isFinite(best)) return null;
        const middle = [];
        for (let node = last; node >= 0; node = previous[node]) middle.push(nodes[node]);
        const points = [start.point, ...middle.reverse(), end.point];
        const coordinates = points.filter(([x, y], index) => index === 0 || x !== points[index - 1][0] || y !== points[index - 1][1]);
        if (coordinates.length === 1) coordinates.push(end.point);
        return {
          from: reverse ? target : root,
          to: reverse ? root : target,
          coordinates: reverse ? coordinates.reverse() : coordinates,
          meters: Math.round(best + start.gap + end.gap)
        };
      };
    };
  }

  // src/components/dashboard/journey-map.ts
  var JOURNEY_COLORS = ["#1972d8", "#bc572b"];
  var labels = {
    "zh-Hant": {
      origin: "\u8D77\u9EDE",
      board: "\u4E0A\u8ECA",
      alight: "\u843D\u8ECA",
      transfer: "\u8F49\u4E58",
      destination: "\u7D42\u9EDE",
      walk: "\u63A5\u99C1\u76F4\u7DDA\uFF08\u975E\u6B65\u884C\u8DEF\u5F91\uFF09",
      snapshot: "\u7AD9\u5E8F\u5FEB\u7167"
    },
    "zh-Hans": {
      origin: "\u8D77\u70B9",
      board: "\u4E0A\u8F66",
      alight: "\u4E0B\u8F66",
      transfer: "\u6362\u4E58",
      destination: "\u7EC8\u70B9",
      walk: "\u63A5\u9A73\u76F4\u7EBF\uFF08\u975E\u6B65\u884C\u8DEF\u5F84\uFF09",
      snapshot: "\u7AD9\u5E8F\u5FEB\u7167"
    },
    en: {
      origin: "Start",
      board: "Board",
      alight: "Alight",
      transfer: "Transfer",
      destination: "Destination",
      walk: "Straight connection, not a walking path",
      snapshot: "dated stop list"
    }
  };
  function currentStop(stop, leg2, eta) {
    const matches = eta?.routeCode === leg2.routeCode && eta.direction === leg2.direction ? eta.stops.filter(
      (item) => item.stationCode === stop.stationCode && item.coordinates
    ) : [];
    const current = matches.length === 1 ? matches[0] : void 0;
    return {
      ...stop,
      stationName: current?.stationName ?? stop.stationName,
      coordinates: current?.coordinates ?? stop.coordinates,
      snapshot: !current
    };
  }
  function legSegments(leg2, eta) {
    if (!eta || eta.routeCode !== leg2.routeCode || eta.direction !== leg2.direction || leg2.stopCount <= 0)
      return null;
    const exact = /* @__PURE__ */ new Map();
    const updated = /* @__PURE__ */ new Map();
    const from = currentStop(leg2.from, leg2, eta).coordinates;
    const to = currentStop(leg2.to, leg2, eta).coordinates;
    const segments = eta.routeSegments;
    for (let start = 0; start < segments.length; start += 1) {
      const first = segments[start];
      if (first.fromStationCode !== leg2.from.stationCode || !first.coordinates[0] || distanceMeters(first.coordinates[0], from) > 25) continue;
      for (let end = start; end < segments.length; end += 1) {
        const segment = segments[end];
        const previous = end > start ? segments[end - 1] : null;
        if (segment.coordinates.length < 2 || previous && (previous.toStationCode !== segment.fromStationCode || distanceMeters(previous.coordinates.at(-1), segment.coordinates[0]) > 25)) break;
        if (segment.toStationCode !== leg2.to.stationCode || distanceMeters(segment.coordinates.at(-1), to) > 25) continue;
        const chain = segments.slice(start, end + 1);
        const candidates2 = chain.length === leg2.stopCount ? exact : updated;
        candidates2.set(JSON.stringify(chain.map((item) => item.coordinates)), chain);
      }
    }
    const candidates = exact.size ? exact : updated;
    return candidates.size === 1 ? [...candidates.values()][0] : null;
  }
  function buildJourneyMap(journey, locale = "zh-Hant") {
    const c = labels[locale];
    const features = [];
    const missingLegs = [];
    const uncertainTransfers = [];
    const bounds = [journey.origin, journey.destination];
    const stops = journey.legs.map(({ leg: leg2, eta }) => ({
      from: currentStop(leg2.from, leg2, eta),
      to: currentStop(leg2.to, leg2, eta)
    }));
    const point = (coordinates, properties) => {
      features.push({
        type: "Feature",
        properties,
        geometry: { type: "Point", coordinates }
      });
      bounds.push(coordinates);
    };
    const marker = (role, index, stop, prefix = c[role]) => {
      const route = journey.legs[index].leg.routeName;
      const routeLabel = role === "transfer" ? `${route} \u2192 ${journey.legs[index + 1].leg.routeName}` : route;
      point(stop.coordinates, {
        kind: "marker",
        role,
        legIndex: index,
        stationCode: stop.stationCode,
        snapshot: stop.snapshot,
        color: role === "transfer" ? "#7252a3" : JOURNEY_COLORS[index % JOURNEY_COLORS.length],
        label: `${prefix} ${routeLabel}
${stop.stationName} ${stop.stationCode}${stop.snapshot ? `
(${c.snapshot})` : ""}`
      });
    };
    const straightLink = (from, to) => {
      if (distanceMeters(from, to) <= 1) return;
      features.push({
        type: "Feature",
        properties: { kind: "walk", verified: false },
        geometry: { type: "LineString", coordinates: [from, to] }
      });
      point([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2], {
        kind: "walk-label",
        label: c.walk
      });
    };
    const connection = (from, to, planned) => {
      const path = walkingPathBetween(planned, from, to);
      if (!path) {
        straightLink(from, to);
        return;
      }
      features.push({
        type: "Feature",
        properties: { kind: "walking-path" },
        geometry: { type: "LineString", coordinates: path.coordinates }
      });
      for (const coordinate of path.coordinates) bounds.push(coordinate);
      straightLink(from, path.coordinates[0]);
      straightLink(path.coordinates.at(-1), to);
    };
    const first = stops[0], last = stops.at(-1);
    const originAtBoard = first && distanceMeters(journey.origin, first.from.coordinates) <= 1;
    const destinationAtAlight = last && distanceMeters(journey.destination, last.to.coordinates) <= 1;
    if (!originAtBoard)
      point(journey.origin, {
        kind: "marker",
        role: "origin",
        color: "#233c4e",
        label: c.origin
      });
    if (first) {
      connection(journey.origin, first.from.coordinates, journey.walking?.access);
      marker(
        "board",
        0,
        first.from,
        originAtBoard ? `${c.origin} / ${c.board}` : c.board
      );
    }
    journey.legs.forEach(({ leg: leg2, eta }, index) => {
      const chain = legSegments(leg2, eta);
      if (!chain) missingLegs.push(index);
      else
        for (const segment of chain) {
          features.push({
            type: "Feature",
            properties: {
              kind: "bus",
              legIndex: index,
              color: JOURNEY_COLORS[index % JOURNEY_COLORS.length],
              width: journey.legs.length > 1 && index === 0 ? 9 : 5,
              route: leg2.routeName
            },
            geometry: { type: "LineString", coordinates: segment.coordinates }
          });
          bounds.push(...segment.coordinates);
        }
      const sameStop = journey.legs[index + 1]?.leg.from.stationCode === leg2.to.stationCode;
      const transfer = sameStop && distanceMeters(stops[index].to.coordinates, stops[index + 1].from.coordinates) <= 3;
      if (sameStop && !transfer) uncertainTransfers.push(index + 1);
      marker(
        transfer ? "transfer" : "alight",
        index,
        stops[index].to,
        !transfer && index === journey.legs.length - 1 && destinationAtAlight ? `${c.alight} / ${c.destination}` : c[transfer ? "transfer" : "alight"]
      );
      if (stops[index + 1] && !transfer)
        marker("board", index + 1, stops[index + 1].from);
      if (eta?.routeCode === leg2.routeCode && eta.direction === leg2.direction && journey.legs[index].positionsFresh) {
        for (const vehicle of eta.vehicles) {
          if (vehicle.positionSource !== "feed" || !vehicle.coordinates) continue;
          features.push({
            type: "Feature",
            properties: {
              kind: "vehicle",
              legIndex: index,
              color: JOURNEY_COLORS[index % JOURNEY_COLORS.length],
              label: [leg2.routeName, vehicle.plate].filter(Boolean).join(" \xB7 ")
            },
            geometry: { type: "Point", coordinates: vehicle.coordinates }
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
        label: journey.destinationName ? `${c.destination}
${journey.destinationName}` : c.destination
      });
    journey.itineraryStops?.forEach((stop, index) => {
      point(stop.coordinates, { kind: "marker", role: "itinerary-stop", color: "#bc572b", label: `${index === 0 ? c.origin : index}. ${stop.name}` });
    });
    return {
      collection: { type: "FeatureCollection", features },
      missingLegs,
      uncertainTransfers,
      bounds
    };
  }

  // ios/Planner/bridge.ts
  var bus;
  var walking;
  var router;
  function configure(busJSON, walkingJSON) {
    bus = JSON.parse(busJSON);
    walking = walkingJSON ? JSON.parse(walkingJSON) : void 0;
    router = walking ? createWalkingRouter(walking) : void 0;
  }
  function search(query) {
    const places = searchJourneyPlaces(walking?.places ?? [], query);
    const stops = bus ? searchBusStops(bus, query).map((stop) => ({
      id: `stop:${stop.stationCode}`,
      name: stop.stationName,
      coordinates: stop.coordinates,
      stationCode: stop.stationCode
    })) : [];
    return JSON.stringify([...places, ...stops]);
  }
  function plan(input) {
    if (!bus) throw new Error("Bus network unavailable");
    const { origin, destination, nearby, departureMinute } = JSON.parse(input);
    const endpoint = (place) => place.stationCode ? { stationCode: place.stationCode } : { coordinates: place.coordinates };
    const needsWalking = !origin.stationCode || !destination.stationCode;
    if (needsWalking && !router) throw new Error("Walking network unavailable");
    const access = router?.(origin.coordinates);
    const egress = router?.(destination.coordinates, true);
    const journeys = planBusJourneys(bus, endpoint(origin), endpoint(destination), {
      includeNearbyStops: nearby,
      departureMinute,
      walking: needsWalking && access && egress ? { access, egress } : void 0
    });
    const direct = access?.(destination.coordinates);
    if (direct) journeys.push({ id: "walk", legs: [], totalStops: 0, accessMeters: 0, egressMeters: 0, transferMeters: 0, walking: { direct } });
    return JSON.stringify({ journeys, networkFetchedAt: bus.fetchedAt, walkingMappedAt: walking?.mappedAt });
  }
  function geometry(input) {
    return JSON.stringify(buildJourneyMap(JSON.parse(input)));
  }
  return __toCommonJS(bridge_exports);
})();
