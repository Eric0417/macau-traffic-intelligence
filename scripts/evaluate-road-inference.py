"""Offline masked-road experiment. Reads a saved normalized snapshot; makes no requests."""
import argparse
import collections
import hashlib
import heapq
import json
import math
from pathlib import Path

LABELS = ('normal', 'slow', 'congested')


def xy(coordinate):
    return (coordinate[0] * 111320 * math.cos(math.radians(22.17)), coordinate[1] * 111320)


def distance(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def graph(roads):
    """Endpoint proximity is a topology proxy, not verified driving connectivity."""
    points = [[xy(c) for c in road['geometry']['coordinates']] for road in roads]
    links = [[] for _ in roads]
    for i, path in enumerate(points):
        for j, other in enumerate(points):
            if i == j:
                continue
            # Reject reversed duplicate geometry and join endpoints only.
            if distance(path[0], other[-1]) < 15 and distance(path[-1], other[0]) < 15:
                continue
            gap = min(distance(path[-1], other[0]), distance(other[-1], path[0]))
            if gap <= 15:
                length = max(10, roads[j]['properties']['lengthMeters'])
                links[i].append((j, gap + length))
    return links


def estimate(index, observed, links):
    queue, seen, samples = [(0, index)], set(), []
    while queue:
        dist, node = heapq.heappop(queue)
        if node in seen or dist > 300:
            continue
        seen.add(node)
        if node != index and node in observed:
            samples.append((observed[node], 1 / (25 + dist)))
            continue
        for neighbor, length in links[node]:
            if neighbor not in seen:
                heapq.heappush(queue, (dist + length, neighbor))
    if len(samples) < 2:
        return None
    votes = collections.defaultdict(float)
    for label, weight in samples:
        votes[label] += weight
    result = max(votes, key=votes.get)
    # Agreement is a heuristic, not a calibrated confidence probability.
    return result if votes[result] / sum(votes.values()) >= 0.8 else None


def metrics(pairs):
    matrix = {actual: {predicted: 0 for predicted in LABELS} for actual in LABELS}
    for actual, predicted in pairs:
        matrix[actual][predicted] += 1
    recall = {label: matrix[label][label] / sum(matrix[label].values()) if sum(matrix[label].values()) else None for label in LABELS}
    return {'count': len(pairs), 'accuracy': sum(a == p for a, p in pairs) / len(pairs) if pairs else None,
            'recall': recall, 'confusion': matrix}


def evaluate(snapshot):
    roads = snapshot['data']['features']
    known = {i: r['properties']['status'] for i, r in enumerate(roads) if r['properties']['status'] in LABELS}
    links = graph(roads)
    results = []
    for mode in ('segment', 'street'):
        predictions, baseline, held = [], [], collections.Counter()
        for fold in range(5):
            def group(i):
                key = roads[i]['properties']['id'] if mode == 'segment' else roads[i]['properties']['name']['zh-Hant']
                return int(hashlib.sha256(key.encode()).hexdigest()[:8], 16) % 5
            observed = {i: label for i, label in known.items() if group(i) != fold}
            majority = collections.Counter(observed.values()).most_common(1)[0][0]
            for index, actual in known.items():
                if group(index) != fold:
                    continue
                held[actual] += 1
                prediction = estimate(index, observed, links)
                if prediction is not None:
                    predictions.append((actual, prediction)); baseline.append((actual, majority))
        covered = collections.Counter(a for a, _ in predictions)
        results.append({'mask': mode, 'heldOut': dict(held), 'coverage': len(predictions) / len(known),
                        'coverageByClass': {label: covered[label] / held[label] if held[label] else None for label in LABELS},
                        'inference': metrics(predictions), 'majorityOnSameSubset': metrics(baseline)})
    return {'snapshotMeta': snapshot['meta'], 'roadCount': len(roads), 'observedCount': len(known),
            'unknownCount': len(roads) - len(known), 'method': 'endpoint-neighbor-vote-v1', 'evaluations': results,
            'productionEnabled': False,
            'limitations': ['Single timestamp; publisher labels are not field ground truth.',
                            'Endpoint proximity is not a verified directed motor-vehicle graph.',
                            'Held-out monitored roads do not establish accuracy on unmonitored side streets.',
                            'No historical speed, signal phase, turning flow, or calibrated confidence data.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('snapshot', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    result = evaluate(json.loads(args.snapshot.read_text()))
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))
