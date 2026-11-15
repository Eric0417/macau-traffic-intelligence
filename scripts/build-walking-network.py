"""Build the ODbL Macau walking snapshot from a Geofabrik .osm.pbf.

Usage: python3 scripts/build-walking-network.py macau-latest.osm.pbf
Requires pyosmium (pip install osmium).
"""

import argparse
import json
import os
from pathlib import Path

import osmium


SOURCE = "https://download.geofabrik.de/asia/china/macau.html"
ATTRIBUTION = "© OpenStreetMap contributors"
LICENCE = "https://www.openstreetmap.org/copyright"
FOOT_HIGHWAYS = {
    "footway", "pedestrian", "path", "steps", "corridor", "living_street",
    "residential", "unclassified", "service", "tertiary", "secondary",
    "primary", "track",
}
ALLOWED_FOOT = {"yes", "designated", "permissive", "official"}
BLOCKED = {"no", "private", "customers", "destination", "delivery", "permit", "use_sidepath"}
BARRIERS = {
    "wall", "fence", "hedge", "retaining_wall", "block", "jersey_barrier",
    "chain", "gate", "lift_gate", "swing_gate", "turnstile", "sliding_gate",
}
OPERABLE_GATES = {"gate", "lift_gate", "swing_gate", "sliding_gate", "turnstile"}
POI_KEYS = {
    "amenity", "tourism", "historic", "shop", "leisure", "office",
    "healthcare", "place", "public_transport", "railway", "aeroway", "craft",
}
NAME_KEYS = (
    "name:zh-Hant", "name:zh", "name", "name:zh-Hans", "name:en", "name:pt",
    "alt_name", "short_name", "official_name",
)


FACILITY_TAGS = {
    "hospital": "hospital", "clinic": "clinic", "doctors": "clinic",
    "pharmacy": "pharmacy", "toilets": "toilets",
}


def facility_category(tags):
    if tags.get("access") in {"private", "no", "customers"} or tags.get("disused") == "yes":
        return None
    if any(marker in tags.get("name", "") for marker in ("暫停開放", "暂停开放")):
        return None
    return FACILITY_TAGS.get(tags.get("amenity")) or FACILITY_TAGS.get(tags.get("healthcare"))


def foot_allowed(tags):
    foot = tags.get("foot", "")
    if tags.get("foot:conditional") or tags.get("access:conditional"):
        return False
    if foot in BLOCKED or (foot not in ALLOWED_FOOT and tags.get("access") in BLOCKED):
        return False
    return True


def direction(tags):
    value = tags.get("oneway:foot", "")
    if tags.get("highway") in {"steps", "footway", "pedestrian", "path", "corridor"}:
        value = value or tags.get("oneway", "")
    if tags.get("conveying") == "backward":
        return 2
    if tags.get("conveying") == "forward":
        return 1
    return 2 if value == "-1" else 1 if value in {"yes", "1", "true"} else 0


def node_blocks_walking(tags):
    if not foot_allowed(tags) or tags.get("locked") == "yes":
        return True
    if tags.get("barrier") not in BARRIERS:
        return False
    if tags.get("foot") in ALLOWED_FOOT or tags.get("access") in ALLOWED_FOOT:
        return False
    return not (tags.get("barrier") in OPERABLE_GATES and tags.get("locked") == "no")


class Snapshot(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.nodes = []
        self.edges = set()
        self.places = []
        self.node_index = {}
        self.blocked_nodes = set()
        self.entrances = {}
        self.areas = []

    def place(self, ident, tags, coordinates, approximate=False):
        named_road = tags.get("highway") in FOOT_HIGHWAYS
        if not tags.get("name") or not (named_road or any(key in tags for key in POI_KEYS)):
            return
        if not (113.4 <= coordinates[0] <= 113.7 and 22 <= coordinates[1] <= 22.3):
            return
        if tags.get("highway") == "bus_stop" or tags.get("public_transport") in {"platform", "stop_position"}:
            return
        names = list(dict.fromkeys(
            value.strip()[:160]
            for key in NAME_KEYS
            for value in tags.get(key, "").split(";")
            if value.strip()
        ))
        if not names:
            return
        context = tags.get("addr:street") or tags.get("addr:suburb") or ""
        category = facility_category(tags)
        self.places.append({
            "id": ident, "name": names[0], "aliases": names[1:],
            "coordinates": coordinates, "context": context[:120],
            **({"approximate": True} if approximate else {}),
            **({"facilityCategory": category} if category else {}),
            **({"street": True} if named_road and not any(key in tags for key in POI_KEYS) else {}),
        })

    def node(self, node):
        if not node.location.valid():
            return
        tags = node.tags
        point = [round(node.location.lon, 7), round(node.location.lat, 7)]
        if node_blocks_walking(tags):
            self.blocked_nodes.add(node.id)
        if tags.get("entrance") in {"main", "yes"} and node.id not in self.blocked_nodes:
            self.entrances[node.id] = (tags.get("entrance") == "main", point)
        self.place(f"n{node.id}", tags, point)

    def way(self, way):
        tags = way.tags
        highway = tags.get("highway")
        if (
            not highway or highway in {"construction", "proposed", "motorway", "motorway_link", "trunk", "trunk_link"}
            or (highway not in FOOT_HIGHWAYS and tags.get("foot") not in ALLOWED_FOOT)
            or tags.get("area") == "yes" or tags.get("motorroad") == "yes" or not foot_allowed(tags)
            or tags.get("sidewalk") == "separate" and tags.get("foot") not in ALLOWED_FOOT
        ):
            return
        travel = direction(tags)
        snap = not any(tags.get(key) not in {None, "no", "0"} for key in ("bridge", "tunnel", "indoor", "covered", "level"))
        if snap and tags.get("name") and not way.is_closed():
            nodes = [node for node in way.nodes if node.location.valid()]
            if nodes:
                middle = nodes[len(nodes) // 2]
                self.place(f"w{way.id}", tags, [round(middle.lon, 7), round(middle.lat, 7)])
        previous = None
        for node in way.nodes:
            if not node.location.valid() or node.ref in self.blocked_nodes:
                previous = None
                continue
            index = self.node_index.get(node.ref)
            if index is None:
                index = len(self.nodes)
                self.node_index[node.ref] = index
                self.nodes.append([round(node.lon, 7), round(node.lat, 7)])
            if previous is not None and self.nodes[previous] != self.nodes[index]:
                if previous < index:
                    self.edges.add((previous, index, travel, snap))
                else:
                    self.edges.add((index, previous, 3 - travel if travel else 0, snap))
            previous = index

    def area(self, area):
        if not area.tags.get("name") or not (
            area.tags.get("highway") == "pedestrian" or any(key in area.tags for key in POI_KEYS)
        ):
            return
        vertices = [node for ring in area.outer_rings() for node in ring if node.location.valid()]
        if not vertices:
            return
        entrances = [self.entrances[node.ref] for node in vertices if node.ref in self.entrances]
        if entrances:
            self.place(f"a{area.id}", area.tags, max(entrances, key=lambda item: item[0])[1])
        else:
            center = [
                round((min(node.lon for node in vertices) + max(node.lon for node in vertices)) / 2, 7),
                round((min(node.lat for node in vertices) + max(node.lat for node in vertices)) / 2, 7),
            ]
            boundary = [[round(node.lon, 7), round(node.lat, 7)] for node in vertices]
            self.areas.append((f"a{area.id}", dict(area.tags), center, boundary))

    def add_area_places(self):
        # Prefer a named polygon's centre when it is near the network. For
        # larger sites use a mapped boundary point, marked as approximate.
        from collections import defaultdict

        bins = defaultdict(list)
        cell = 0.0005
        for index in {node for a, b, _, snap in self.edges if snap for node in (a, b)}:
            x, y = self.nodes[index]
            bins[int(x / cell), int(y / cell)].append((x, y))

        def nearby_distance(point):
            x, y = point
            i, j = int(x / cell), int(y / cell)
            return min(
                ((nx - x) * 0.927) ** 2 + (ny - y) ** 2
                for di in (-1, 0, 1) for dj in (-1, 0, 1)
                for nx, ny in bins.get((i + di, j + dj), [(x + 1, y + 1)])
            )

        for ident, tags, center, boundary in self.areas:
            point = center if nearby_distance(center) <= (45 / 111_195) ** 2 else min(boundary, key=nearby_distance)
            self.place(ident, tags, point, approximate=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("extract", type=Path)
    parser.add_argument("--output", type=Path, default=Path("data/walking-network.json"))
    args = parser.parse_args()
    with osmium.io.Reader(str(args.extract)) as reader:
        date = reader.header().get("osmosis_replication_timestamp")
    if not date:
        raise ValueError("The extract must include its replication timestamp.")
    snapshot = Snapshot()
    snapshot.apply_file(str(args.extract), locations=True)
    snapshot.add_area_places()
    if not snapshot.nodes or not snapshot.edges or not snapshot.places:
        raise ValueError("The extract contains no complete place and walking data.")
    payload = {
        "mappedAt": date, "source": SOURCE, "attribution": ATTRIBUTION, "licence": LICENCE,
        "places": snapshot.places, "nodes": snapshot.nodes, "edges": sorted(snapshot.edges),
    }
    temporary = args.output.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    os.replace(temporary, args.output)
    print(f"{date}: {len(snapshot.places)} places, {len(snapshot.nodes)} nodes, {len(snapshot.edges)} edges")


if __name__ == "__main__":
    main()
