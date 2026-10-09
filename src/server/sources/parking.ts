import "server-only";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { z } from "zod";
import locationsJson from "../../../data/parking-locations.json";
import { parkingFacilitySchema } from "@/lib/contracts";
import { fetchText } from "@/server/http";
import type { SourceDefinition } from "@/server/source";
import type { ParkingAvailability } from "@/lib/types";

const PARKING_URL =
  "https://www.dsat.gov.mo/dsat/carpark_realtime_core.aspx?lang=tc";

const parkingLocationsSchema = z.object({
  generatedAt: z.string(),
  source: z.string(),
  license: z.string(),
  locations: z.record(
    z.string(),
    z.object({
      name: z.string(),
      coordinates: z.tuple([z.number(), z.number()]),
    }),
  ),
});

const parkingLocations = parkingLocationsSchema.parse(locationsJson);

const iconFields: Record<string, keyof ParkingAvailability> = {
  "carpark_car.png": "lightVehicle",
  "carpark_motor.png": "motorcycle",
  "carpark_ecar.png": "electricVehicle",
  "carpark_emotor.png": "electricMotorcycle",
  "carpark_disabled.png": "accessible",
  "lt_8m.png": "heavyVehicleShort",
  "gt_8m.png": "heavyVehicleLong",
};

function parseCount(value: string): number | null {
  const count = value.replace(/\s+/g, " ").trim();
  if (!count) return null;
  if (count === "-" || count === "N/A") return null;
  const match = count.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function macauIso(value: string): string {
  const match = value.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/);
  if (!match) return new Date().toISOString();
  return new Date(`${match[1]}T${match[2]}+08:00`).toISOString();
}

function availabilityForRow(row: cheerio.Cheerio<AnyNode>): ParkingAvailability {
  const availability: ParkingAvailability = {
    lightVehicle: null,
    motorcycle: null,
    electricVehicle: null,
    electricMotorcycle: null,
    accessible: null,
    heavyVehicleShort: null,
    heavyVehicleLong: null,
  };

  row.find("img").each((_, image) => {
    const src = row.find(image).attr("src") ?? "";
    const icon = Object.keys(iconFields).find((name) => src.includes(name));
    if (!icon) return;

    const field = iconFields[icon];
    const containerText = row.find(image).closest("div").text();
    availability[field] = parseCount(containerText);
  });

  return availability;
}

export function parseParkingHtml(html: string) {
  const $ = cheerio.load(html);

  return $("tr")
    .filter((_, row) => $(row).find('a[href*="carpark_detail.aspx"]').length > 0)
    .map((_, row) => {
      const element = $(row);
      const href = element.find('a[href*="carpark_detail.aspx"]').attr("href") ?? "";
      const id = href.match(/id=(\d+)/)?.[1];
      const name = element.find(".carpark_name_text div").first().text().trim();
      const updatedText = element
        .find(".carpark_name_text div")
        .eq(1)
        .text()
        .replace(/\s+/g, " ")
        .trim();
      const areaIcon = element.find('img[src*="carpark_ss_"]').attr("src") ?? "";
      const areaStatus = areaIcon.includes("yellow")
        ? "yellow"
        : areaIcon.includes("orange")
          ? "orange"
          : areaIcon.includes("green")
            ? "green"
            : "unknown";

      if (!id || !name) return null;

      return parkingFacilitySchema.parse({
        id,
        name,
        updatedAt: macauIso(updatedText),
        areaStatus,
        coordinates: parkingLocations.locations[id]?.coordinates ?? null,
        availability: availabilityForRow(element),
      });
    })
    .get()
    .filter((facility): facility is NonNullable<typeof facility> => facility !== null);
}

export async function loadParking() {
  const html = await fetchText(PARKING_URL, { timeoutMs: 8_000 });
  const facilities = parseParkingHtml(html);

  if (facilities.length < 50) {
    throw new Error(`Parking parser found only ${facilities.length} facilities`);
  }

  return facilities;
}

export const parkingSource: SourceDefinition<Awaited<ReturnType<typeof loadParking>>> = {
  id: "parking",
  name: "DSAT 公共停車場",
  url: "https://www.dsat.gov.mo/dsat/carpark_realtime.aspx",
  attribution: "交通事務局公共停車場實時車位資訊",
  envKey: "SOURCE_PARKING_ENABLED",
  ttlSeconds: 30,
  staleTtlSeconds: 300,
  schema: parkingFacilitySchema.array(),
  load: loadParking,
};
