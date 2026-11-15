import { z } from "zod";

export const facilityCategorySchema = z.enum(["hospital", "clinic", "pharmacy", "toilets"]);

export const facilitySearchSchema = z.object({
  category: facilityCategorySchema,
  action: z.enum(["nearest", "list", "directions"]),
  distance: z.enum(["straight", "walking"]).optional(),
  verify: z.enum(["hours", "service"]).optional(),
});

export type FacilityCategory = z.infer<typeof facilityCategorySchema>;
export type FacilitySearch = z.infer<typeof facilitySearchSchema>;

export const facilityLabels: Record<FacilityCategory, Record<"zh-Hant" | "zh-Hans" | "en", string>> = {
  hospital: { "zh-Hant": "醫院", "zh-Hans": "医院", en: "Hospitals" },
  clinic: { "zh-Hant": "診所", "zh-Hans": "诊所", en: "Clinics" },
  pharmacy: { "zh-Hant": "藥房", "zh-Hans": "药房", en: "Pharmacies" },
  toilets: { "zh-Hant": "廁所", "zh-Hans": "厕所", en: "Toilets" },
};
