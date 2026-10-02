import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const endpoint = "https://overpass-api.de/api/interpreter";
const query = `[out:json][timeout:60];
relation["route"="light_rail"](22.10,113.52,22.23,113.60);
out body;
>;
out skel qt;`;

let payload;

if (process.env.OVERPASS_INPUT) {
  payload = JSON.parse(await readFile(process.env.OVERPASS_INPUT, "utf8"));
} else {
  const url = new URL(endpoint);
  url.searchParams.set("data", query);
  const response = await fetch(url, {
    headers: {
      "User-Agent": "MacauTrafficIntelligence/0.1",
    },
  });

  if (!response.ok) {
    throw new Error(`Overpass returned ${response.status}`);
  }

  payload = await response.json();
}
const byId = new Map(payload.elements.map((element) => [`${element.type}:${element.id}`, element]));

const chosenRelations = {
  Taipa: 10402162,
  "Seac Pai Van": 18238277,
  Hengqin: 18361945,
};

const taipaStations = [
  ["TFT", "氹仔碼頭站", "Taipa Ferry Terminal", "Terminal Marítimo da Taipa"],
  ["AIR", "機場站", "Airport", "Aeroporto"],
  ["MUST", "科大站", "M.U.S.T.", "M.U.S.T."],
  ["COE", "路氹東站", "Cotai East", "Cotai Leste"],
  ["EAG", "東亞運站", "East Asian Games", "Jogos da Ásia Oriental"],
  ["HU", "協和醫院站", "Union Hospital", "Hospital Union"],
  ["LOT", "蓮花站", "Lotus", "Lótus"],
  ["COW", "路氹西站", "Cotai West", "Cotai Oeste"],
  ["PAK", "排角站", "Pai Kok", "Pai Kok"],
  ["STA", "運動場站", "Stadium", "Estádio"],
  ["JOC", "馬會站", "Jockey Club", "Jockey Clube"],
  ["OCE", "海洋站", "Ocean", "Oceano"],
  ["BAR", "媽閣站", "Barra", "Barra"],
];

const spvStations = [
  ["SPV", "石排灣站", "Seac Pai Van", "Seac Pai Van"],
  ["HU", "協和醫院站", "Union Hospital", "Hospital Union"],
];

const hqStations = [
  ["HQ", "橫琴站", "Hengqin", "Hengqin"],
  ["LOT", "蓮花站", "Lotus", "Lótus"],
];

const stationDefinitions = {
  Taipa: taipaStations,
  "Seac Pai Van": spvStations,
  Hengqin: hqStations,
};

function localized(zh, en, pt) {
  return {
    "zh-Hant": zh,
    "zh-Hans": zh
      .replace(/碼/g, "码")
      .replace(/閣/g, "阁")
      .replace(/運/g, "运")
      .replace(/場/g, "场")
      .replace(/馬/g, "马")
      .replace(/會/g, "会")
      .replace(/協/g, "协")
      .replace(/醫/g, "医")
      .replace(/蓮/g, "莲")
      .replace(/龍/g, "龙")
      .replace(/亞/g, "亚")
      .replace(/東/g, "东")
      .replace(/機/g, "机")
      .replace(/橫/g, "横")
      .replace(/灣/g, "湾"),
    en,
    pt,
  };
}

function relationLine(relation) {
  const wayIds = relation.members.filter((member) => member.type === "way").map((member) => member.ref);
  const ways = wayIds
    .map((id) => byId.get(`way:${id}`))
    .filter(Boolean)
    .map((way) => way.nodes.map((id) => byId.get(`node:${id}`)).filter(Boolean));

  const pending = ways.filter((way) => way.length > 1);
  if (!pending.length) return [];

  let coordinates = pending.shift().map((node) => [node.lon, node.lat]);

  while (pending.length) {
    const tail = coordinates.at(-1);
    let best = null;

    for (let index = 0; index < pending.length; index += 1) {
      const way = pending[index];
      const first = [way[0].lon, way[0].lat];
      const last = [way.at(-1).lon, way.at(-1).lat];
      const options = [
        { index, reverse: false, distance: Math.hypot(tail[0] - first[0], tail[1] - first[1]) },
        { index, reverse: true, distance: Math.hypot(tail[0] - last[0], tail[1] - last[1]) },
      ];
      const candidate = options.sort((a, b) => a.distance - b.distance)[0];
      if (!best || candidate.distance < best.distance) best = candidate;
    }

    if (!best) break;
    const [selected] = pending.splice(best.index, 1);
    const oriented = best.reverse ? selected.toReversed() : selected;
    coordinates.push(...oriented.map((node) => [node.lon, node.lat]));
  }

  return coordinates.filter((coordinate, index, all) => {
    if (index === 0) return true;
    const prior = all[index - 1];
    return Math.hypot(coordinate[0] - prior[0], coordinate[1] - prior[1]) > 0.000002;
  });
}

function stationCoordinates(relation, expectedCount) {
  const stopNodes = relation.members
    .filter((member) => member.type === "node" && member.role === "stop")
    .map((member) => byId.get(`node:${member.ref}`))
    .filter(Boolean);

  if (stopNodes.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} ${relation.tags.ref} stops, got ${stopNodes.length}`);
  }

  return stopNodes.map((node) => [node.lon, node.lat]);
}

const lines = [];
const stationMap = new Map();

for (const [ref, relationId] of Object.entries(chosenRelations)) {
  const relation = byId.get(`relation:${relationId}`);
  if (!relation) throw new Error(`Missing relation ${relationId}`);

  lines.push({
    type: "Feature",
    properties: {
      id: String(relation.id),
      ref,
      name: {
        "zh-Hant": relation.tags["name:zh"],
        "zh-Hans": relation.tags["name:zh"]
          .replace(/碼/g, "码")
          .replace(/閣/g, "阁")
          .replace(/線/g, "线"),
        en: relation.tags["name:en"],
        pt: relation.tags["name:pt"],
      },
      color: relation.tags.colour,
    },
    geometry: {
      type: "LineString",
      coordinates: relationLine(relation),
    },
  });

  const definitions = stationDefinitions[ref];
  const coordinates = stationCoordinates(relation, definitions.length);

  definitions.forEach(([code, zh, en, pt], index) => {
    const current = stationMap.get(code);
    if (current) {
      if (!current.lines.includes(ref)) current.lines.push(ref);
      current.interchange = true;
      return;
    }

    stationMap.set(code, {
      id: code,
      name: localized(zh, en, pt),
      coordinates: coordinates[index],
      lines: [ref],
      interchange: false,
    });
  });
}

const output = {
  lines: {
    type: "FeatureCollection",
    features: lines,
  },
  stations: [...stationMap.values()],
  timetableEdition: "2026-09",
  sourceUpdatedAt: new Date().toISOString(),
};

const target = path.join(process.cwd(), "data", "lrt-network.json");
await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Wrote ${output.lines.features.length} lines and ${output.stations.length} stations to ${target}`);
