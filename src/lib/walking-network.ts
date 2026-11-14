import { distanceMeters, type Coordinates } from "./resident-tools";

export interface JourneyPlace {
  id: string;
  name: string;
  aliases: string[];
  coordinates: Coordinates;
  context: string;
  approximate?: boolean;
  street?: boolean;
}

export type WalkingEdge = [from: number, to: number, direction: 0 | 1 | 2, canSnap: boolean];

export interface WalkingNetwork {
  mappedAt: string;
  places: JourneyPlace[];
  nodes: Coordinates[];
  edges: WalkingEdge[];
}

export interface WalkingPath {
  from: Coordinates;
  to: Coordinates;
  coordinates: Coordinates[];
  meters: number;
}

export function walkingPathBetween(path: WalkingPath | undefined, from: Coordinates, to: Coordinates) {
  return path && distanceMeters(path.from, from) <= 3 && distanceMeters(path.to, to) <= 3 ? path : undefined;
}

const normalize = (name: string) => name.normalize("NFKD").toLowerCase().replace(/[\p{M}\s\p{P}]/gu, "");

export function searchJourneyPlaces(places: JourneyPlace[], query: string): JourneyPlace[] {
  const needle = normalize(query);
  if (!needle) return [];
  const matches = places.flatMap((place) => {
    const names = [place.name, ...place.aliases].map(normalize);
    const rank = names.includes(needle) ? 0 : names.some((name) => name.startsWith(needle)) ? 1
      : names.some((name) => name.includes(needle)) ? 2 : -1;
    return rank < 0 ? [] : [{ place, rank }];
  });
  matches.sort((a, b) => a.rank - b.rank
    || Number(Boolean(a.place.street)) - Number(Boolean(b.place.street))
    || a.place.name.length - b.place.name.length);
  const results: JourneyPlace[] = [];
  for (const { place } of matches) {
    if (results.some((match) => match.name === place.name && distanceMeters(match.coordinates, place.coordinates) < 75)) continue;
    results.push(place);
    if (results.length === 6) break;
  }
  return results;
}

type QueueItem = [meters: number, node: number];

class MinQueue {
  private items: QueueItem[] = [];

  push(item: QueueItem) {
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

  pop(): QueueItem | undefined {
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
}

interface Snap {
  edge: number;
  point: Coordinates;
  fraction: number;
  gap: number;
}

const MAX_SNAP_METERS = 55;
const longitudeScale = Math.cos(22.16 * Math.PI / 180);
const searchRadius = MAX_SNAP_METERS / 100_000;

export function createWalkingRouter({ nodes, edges }: Pick<WalkingNetwork, "nodes" | "edges">) {
  const lengths = edges.map(([a, b]) => distanceMeters(nodes[a], nodes[b]));
  const outgoing: [node: number, length: number][][] = nodes.map(() => []);
  const incoming: [node: number, length: number][][] = nodes.map(() => []);
  const parents = Int32Array.from(nodes, (_, index) => index);
  const sizes = new Int32Array(nodes.length).fill(1);
  function component(node: number): number {
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

  function snap(coordinates: Coordinates): Snap | null {
    let best: Snap | null = null;
    let bestOnMain: Snap | null = null;
    for (let edge = 0; edge < edges.length; edge++) {
      const [a, b, , canSnap] = edges[edge];
      if (!canSnap) continue;
      const start = nodes[a], end = nodes[b];
      const [x, y] = coordinates;
      if (x < Math.min(start[0], end[0]) - searchRadius || x > Math.max(start[0], end[0]) + searchRadius ||
          y < Math.min(start[1], end[1]) - searchRadius || y > Math.max(start[1], end[1]) + searchRadius) continue;
      const dx = end[0] - start[0], dy = end[1] - start[1];
      const scaleSquared = longitudeScale ** 2;
      const lengthSquared = dx * dx * scaleSquared + dy * dy;
      if (!lengthSquared) continue;
      const fraction = Math.min(1, Math.max(0,
        ((x - start[0]) * dx * scaleSquared + (y - start[1]) * dy) / lengthSquared,
      ));
      const point: Coordinates = [start[0] + fraction * dx, start[1] + fraction * dy];
      const gap = distanceMeters(coordinates, point);
      if (gap > MAX_SNAP_METERS) continue;
      const candidate = { edge, point, fraction, gap };
      if (!best || gap < best.gap) best = candidate;
      if (component(a) === largest && (!bestOnMain || gap < bestOnMain.gap)) bestOnMain = candidate;
    }
    return bestOnMain ?? best;
  }

  function endpoints(point: Snap, reverse: boolean) {
    const [a, b, direction] = edges[point.edge];
    const length = lengths[point.edge];
    const ends: QueueItem[] = [];
    if (point.fraction === 0 || direction === 0 || direction === (reverse ? 1 : 2)) {
      ends.push([point.fraction * length, a]);
    }
    if (point.fraction === 1 || direction === 0 || direction === (reverse ? 2 : 1)) {
      ends.push([(1 - point.fraction) * length, b]);
    }
    return ends;
  }

  return (root: Coordinates, reverse = false) => {
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
    return (target: Coordinates): WalkingPath | null => {
      const end = snap(target);
      if (!end) return null;
      let best = Infinity;
      let last = -1;
      if (start.edge === end.edge) {
        const delta = end.fraction - start.fraction;
        const direction = edges[start.edge][2];
        if (direction === 0 || delta === 0 || direction === ((delta > 0) !== reverse ? 1 : 2)) {
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
      const middle: Coordinates[] = [];
      for (let node = last; node >= 0; node = previous[node]) middle.push(nodes[node]);
      const points = [start.point, ...middle.reverse(), end.point];
      const coordinates = points.filter(([x, y], index) =>
        index === 0 || x !== points[index - 1][0] || y !== points[index - 1][1]);
      if (coordinates.length === 1) coordinates.push(end.point);
      return {
        from: reverse ? target : root,
        to: reverse ? root : target,
        coordinates: reverse ? coordinates.reverse() : coordinates,
        meters: Math.round(best + start.gap + end.gap),
      };
    };
  };
}
