import { z } from "zod";
import type { AssistantPlace } from "./assistant-journey";
import type { BusJourney } from "./bus-journey";

const query = z.string().trim().min(1).max(150);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const tripDraftSchema = z.object({
  mode: z.enum(["ordered", "day"]),
  fixedStops: z.boolean().optional(),
  theme: query.optional(),
  originQuery: query.optional(),
  originId: z.string().min(1).max(120).optional(),
  endQuery: query.optional(),
  endId: z.string().min(1).max(120).optional(),
  stops: z.array(z.object({ query, placeId: z.string().min(1).max(120).optional(), stayMinutes: z.number().int().min(0).max(240).optional() })).max(8).default([]),
  date: z.iso.date().optional(),
  startTime: time.optional(),
  endTime: time.optional(),
  preferences: z.string().trim().min(1).max(300).optional(),
});
export type TripDraft = z.infer<typeof tripDraftSchema>;
export const tripDetailFields = ["date", "startTime", "endTime", "originQuery", "endQuery", "preferences"] as const;
export type TripDetailField = typeof tripDetailFields[number];
export function missingTripDetails(draft: TripDraft): TripDetailField[] {
  return draft.mode === "day" ? tripDetailFields.filter(field => !draft[field]) : [];
}
export const timeMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export const minuteTime = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** Visit targets allocate the user's available time; gaps are not travel predictions. */
export function scheduleVisits(visits: Array<{ minutes: number; opens: number; closes: number; lastAdmission?: number }>, start: string, end: string): number[] | null {
  let cursor = timeMinutes(start);
  const finish = timeMinutes(end);
  if (finish <= cursor) return null;
  const latest: number[] = [];
  let next = finish;
  for (let i = visits.length - 1; i >= 0; i--) {
    const visit = visits[i];
    latest[i] = Math.min(next - visit.minutes, visit.closes - visit.minutes, visit.lastAdmission ?? 1440);
    if (latest[i] < visit.opens) return null;
    next = latest[i];
  }
  const result: number[] = [];
  for (const [i, visit] of visits.entries()) {
    const remaining = visits.slice(i).reduce((total, v) => total + v.minutes, 0);
    const gap = Math.max(0, Math.floor((finish - cursor - remaining) / (visits.length - i + 1)));
    const target = Math.max(visit.opens, Math.min(Math.ceil((cursor + gap) / 15) * 15, latest[i]));
    if (target < cursor || target > latest[i]) return null;
    result.push(target);
    cursor = target + visit.minutes;
  }
  return result;
}

export interface ItineraryStop extends AssistantPlace {
  stayMinutes: number;
  visit?: boolean;
  targetTime?: string;
  sourceUrl?: string;
  checkedAt?: string;
  hours?: string;
}
export interface ItinerarySection {
  from: AssistantPlace;
  to: AssistantPlace;
  journeys: BusJourney[];
  warnings: string[];
}
export interface ItineraryOption {
  id: string;
  title: string;
  reason: string;
  stops: ItineraryStop[];
  sections: ItinerarySection[];
}
export interface ItineraryPlans {
  kind: "itineraries";
  draft: TripDraft;
  generatedAt: string;
  networkFetchedAt: string;
  walkingMappedAt: string;
  options: ItineraryOption[];
  warnings: string[];
}
export type ItineraryResult =
  | { kind: "trip-details"; draft: TripDraft; missing: TripDetailField[]; message?: string }
  | { kind: "trip-choice"; draft: TripDraft; field: "origin" | "end" | number; query: string; choices: AssistantPlace[] }
  | { kind: "trip-location"; draft: TripDraft }
  | ItineraryPlans;
