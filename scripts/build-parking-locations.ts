import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";

const PARKING_URL =
  "https://www.dsat.gov.mo/dsat/carpark_realtime_core.aspx?lang=tc";
const OVERPASS_URLS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const MACAU_GIS_AREAS = ["P", "T", "S"] as const;
const BBOX = "22.09,113.50,22.23,113.62";

// Names the DSAT list uses that do not share a token with the OSM name.
const NAME_HINTS: Record<string, string> = {
  南灣大馬路: "栢湖",
  協和醫院: "協和醫院",
};

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface GisCarparkFeature {
  attributes?: {
    CNAME?: string;
    SNAME?: string;
    PNAME?: string;
    ENAME?: string;
  };
  geometry?: { x?: number; y?: number };
}

function normalizeName(name: string): string {
  return name
    .replace(/[\s\-_()（）\/，,.·—–]/g, "")
    .replace(/停車場|停車大樓|公眾|公共/g, "")
    .toLowerCase();
}

function fetchParkingRows(html: string) {
  const $ = cheerio.load(html);
  const rows = new Map<string, string>();
  $("tr")
    .filter((_, row) => $(row).find('a[href*="carpark_detail.aspx"]').length > 0)
    .each((_, row) => {
      const element = $(row);
      const href = element.find('a[href*="carpark_detail.aspx"]').attr("href") ?? "";
      const id = href.match(/id=(\d+)/)?.[1];
      const name = element.find(".carpark_name_text div").first().text().trim();
      if (id && name) rows.set(id, name);
    });
  return [...rows].map(([id, name]) => ({ id, name }));
}

async function fetchOverpassElements(): Promise<OverpassElement[]> {
  const query = `[out:json][timeout:60];nwr(${BBOX})["amenity"="parking"];out center tags;`;
  let lastError = "no mirror answered";
  for (const url of OVERPASS_URLS) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "MacauTrafficIntelligence/0.1 (parking locations build)",
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) {
        lastError = `${url} returned ${response.status}`;
        continue;
      }
      const body = (await response.json()) as { elements?: OverpassElement[] };
      if (!body.elements) {
        lastError = `${url} returned no elements`;
        continue;
      }
      return body.elements;
    } catch (error) {
      lastError = `${url}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  throw new Error(`Overpass unavailable: ${lastError}`);
}

function coordinatesOf(element: OverpassElement): [number, number] | null {
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  return typeof lat === "number" && typeof lon === "number" ? [lon, lat] : null;
}

function matchByName(
  name: string,
  lots: Array<{ name: string; coordinates: [number, number] }>,
) {
  const normalized = normalizeName(name);
  let match = lots.find((lot) => normalizeName(lot.name) === normalized);
  if (!match && normalized.length >= 3) {
    match = lots.find((lot) => {
      const candidate = normalizeName(lot.name);
      return candidate.includes(normalized) || normalized.includes(candidate);
    });
  }
  return match;
}

function matchWithHints(
  name: string,
  lots: Array<{ name: string; coordinates: [number, number] }>,
) {
  const match = matchByName(name, lots);
  if (match) return match;
  for (const [key, hint] of Object.entries(NAME_HINTS)) {
    if (!name.includes(key)) continue;
    const hinted = lots.find((lot) => lot.name.includes(hint));
    if (hinted) return hinted;
  }
  return undefined;
}

async function fetchGisCarparkArea(
  area: string,
): Promise<Array<{ name: string; coordinates: [number, number] }>> {
  const url =
    `https://webmap.gis.gov.mo/arcgis/rest/services/WebMap/MacauMap_${area}_POI/MapServer/8/query` +
    "?where=1%3D1&outFields=CNAME,SNAME,PNAME,ENAME&returnGeometry=true&outSR=4326&f=json&resultRecordCount=2000";
  const response = await fetch(url, {
    headers: { "User-Agent": "MacauTrafficIntelligence/0.1 (parking locations build)" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Macau GIS carpark layer returned ${response.status} for ${area}`);
  }
  const body = (await response.json()) as { features?: GisCarparkFeature[] };
  return (body.features ?? [])
    .map((feature) => {
      const name =
        feature.attributes?.CNAME ??
        feature.attributes?.SNAME ??
        feature.attributes?.PNAME ??
        feature.attributes?.ENAME;
      const x = feature.geometry?.x;
      const y = feature.geometry?.y;
      return name && typeof x === "number" && typeof y === "number"
        ? { name, coordinates: [x, y] as [number, number] }
        : null;
    })
    .filter((lot): lot is { name: string; coordinates: [number, number] } => lot !== null);
}

async function fetchGisCarparks() {
  const areas = await Promise.all(MACAU_GIS_AREAS.map(fetchGisCarparkArea));
  const merged = new Map<string, { name: string; coordinates: [number, number] }>();
  for (const lot of areas.flat()) {
    const key = normalizeName(lot.name);
    if (!merged.has(key)) merged.set(key, lot);
  }
  return [...merged.values()];
}

async function main() {
  const parkingResponse = await fetch(PARKING_URL, {
    headers: { "User-Agent": "MacauTrafficIntelligence/0.1 (parking locations build)" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!parkingResponse.ok) {
    throw new Error(`DSAT parking page returned ${parkingResponse.status}`);
  }

  const dsatRows = fetchParkingRows(await parkingResponse.text());
  const elements = await fetchOverpassElements();
  const gisLots = await fetchGisCarparks();
  const osmLots = elements
    .map((element) => {
      const name = element.tags?.["name:zh"] ?? element.tags?.name;
      const coordinates = coordinatesOf(element);
      return name && coordinates ? { name, coordinates } : null;
    })
    .filter((lot): lot is { name: string; coordinates: [number, number] } => lot !== null);

  const locations: Record<string, { name: string; coordinates: [number, number] }> = {};
  const unmatched: string[] = [];
  let osmMatched = 0;
  let gisMatched = 0;

  for (const row of dsatRows) {
    const osmMatch = matchWithHints(row.name, osmLots);
    const match = osmMatch ?? matchByName(row.name, gisLots);
    if (match) {
      if (osmMatch) osmMatched += 1;
      else gisMatched += 1;
      locations[row.id] = { name: row.name, coordinates: match.coordinates };
    } else {
      unmatched.push(`${row.id} ${row.name}`);
    }
  }

  const target = path.join(process.cwd(), "data", "parking-locations.json");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(
    target,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source:
          "OpenStreetMap amenity=parking matched by name, with Macau GIS Carpark POIs (DSSCU) for unmatched facilities",
        license: "ODbL for OpenStreetMap; Macau GIS data subject to Macau SAR Government terms",
        locations,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    `matched ${Object.keys(locations).length} of ${dsatRows.length} car parks ` +
      `(${osmMatched} OpenStreetMap, ${gisMatched} Macau GIS) -> ${target}`,
  );
  if (unmatched.length) console.log(`unmatched:\n${unmatched.join("\n")}`);
}

void main();
