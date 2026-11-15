import type { z } from "zod";
import type { assistantJourneyRequestSchema } from "./contracts";
import type { BusJourney } from "./bus-journey";
import type { Coordinates } from "./resident-tools";
import type { ItineraryResult } from "./itinerary";
import type { FacilitySearch } from "./facility-search";
import type { LearningAssistantAnswer } from "./types";

export type AssistantJourneyRequest = z.infer<typeof assistantJourneyRequestSchema>;
export interface AssistantPlace {
  id: string;
  name: string;
  coordinates: Coordinates;
  nearbyStop?: string;
}
export interface AssistantFacilityResults {
  kind: "facilities";
  origin: AssistantPlace;
  search: FacilitySearch;
  matches: Array<AssistantPlace & { distanceMeters: number; context?: string }>;
  mappedAt: string;
  routeNote?: string;
}

export interface AssistantJourneyPlans {
  kind: "plans";
  origin: AssistantPlace;
  destination: AssistantPlace;
  generatedAt: string;
  networkFetchedAt: string;
  walkingMappedAt: string;
  model: string;
  summary: string;
  warnings: string[];
  taxiAlternative?: string;
  facilityMatch?: { search: FacilitySearch; distanceMeters: number };
  options: Array<{ title: string; reason: string; journey: BusJourney }>;
}
export type AssistantJourneyResult =
  | ItineraryResult
  | { kind: "traffic" }
  | { kind: "emergency" }
  | { kind: "facility-location"; search: FacilitySearch; reason?: "outside-macau" | "unknown-landmark" }
  | AssistantFacilityResults
  | { kind: "nearby-location" }
  | { kind: "nearby"; answer: LearningAssistantAnswer }
  | { kind: "clarify"; message: string; allowOrigin?: boolean }
  | { kind: "location"; destination: AssistantPlace }
  | { kind: "choose"; field: "origin" | "destination"; choices: AssistantPlace[]; destination?: AssistantPlace; originQuery?: string; facilitySearch?: FacilitySearch }
  | AssistantJourneyPlans;
