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
  const osmLots = elements
    .map((element) => {
      const name = element.tags?.["name:zh"] ?? element.tags?.name;
      const coordinates = coordinatesOf(element);
      return name && coordinates ? { name, coordinates } : null;
    })
    .filter((lot): lot is { name: string; coordinates: [number, number] } => lot !== null);

  const locations: Record<string, { name: string; coordinates: [number, number] }> = {};
  const unmatched: string[] = [];

  for (const row of dsatRows) {
    const normalized = normalizeName(row.name);
    let match = osmLots.find((lot) => normalizeName(lot.name) === normalized);
    if (!match && normalized.length >= 3) {
      match = osmLots.find((lot) => {
        const candidate = normalizeName(lot.name);
        return candidate.includes(normalized) || normalized.includes(candidate);
      });
    }
    if (!match) {
      for (const [key, hint] of Object.entries(NAME_HINTS)) {
        if (!row.name.includes(key)) continue;
        match = osmLots.find((lot) => lot.name.includes(hint));
        if (match) break;
      }
    }
    if (match) {
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
        source: "OpenStreetMap amenity=parking, matched to the DSAT car park list by name",
        license: "ODbL",
        locations,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    `matched ${Object.keys(locations).length} of ${dsatRows.length} car parks -> ${target}`,
  );
  if (unmatched.length) console.log(`unmatched:\n${unmatched.join("\n")}`);
}

void main();
