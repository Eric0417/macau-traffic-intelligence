import "server-only";
import { z } from "zod";
import snapshot from "../../../data/cultural-places.json";
import type { SourceDefinition } from "@/server/source";

export const culturalPlaceSchema = z.object({
  id: z.string().startsWith("culture:"),
  placeId: z.string().min(1),
  name: z.string().min(1), nameEn: z.string().min(1),
  tags: z.array(z.string()).min(1),
  opens: z.number().int().min(0).max(1439),
  closes: z.number().int().min(1).max(1440),
  lastAdmission: z.number().int().min(0).max(1439).optional(),
  closedDays: z.array(z.number().int().min(0).max(6)),
  sourceUrl: z.url().refine(url => ["www.wh.gov.mo", "www.wh.mo", "www.culturalheritage.mo"].includes(new URL(url).hostname) && url.startsWith("https://")),
  checkedAt: z.iso.date(),
}).refine(p => p.opens < p.closes && (p.lastAdmission === undefined || p.lastAdmission <= p.closes));
export type CulturalPlace = z.infer<typeof culturalPlaceSchema>;
export const culturalPlacesSource: SourceDefinition<CulturalPlace[]> = {
  id: "cultural-places", name: "Reviewed Macau cultural places",
  url: "https://www.wh.gov.mo/cn/content/visitor/",
  attribution: "Official Macau heritage opening rules; coordinates from the dated OpenStreetMap walking network. Suggested visit durations are planning choices.",
  envKey: "SOURCE_CULTURAL_PLACES_ENABLED", ttlSeconds: 86_400, staleTtlSeconds: 2_592_000,
  schema: z.array(culturalPlaceSchema).min(1),
  load: async () => z.array(culturalPlaceSchema).min(1).parse(snapshot),
};
