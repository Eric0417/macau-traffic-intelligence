import type { z } from "zod";
import type { assistantJourneyRequestSchema } from "./contracts";
import type { BusJourney } from "./bus-journey";
import type { Coordinates } from "./resident-tools";
import type { ItineraryResult } from "./itinerary";
import type { LearningAssistantAnswer } from "./types";

export type AssistantJourneyRequest = z.infer<typeof assistantJourneyRequestSchema>;
export interface AssistantPlace {
  id: string;
  name: string;
  coordinates: Coordinates;
  nearbyStop?: string;
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
  options: Array<{ title: string; reason: string; journey: BusJourney }>;
}
export type AssistantJourneyResult =
  | ItineraryResult
  | { kind: "traffic" }
  | { kind: "nearby-location" }
  | { kind: "nearby"; answer: LearningAssistantAnswer }
  | { kind: "clarify"; message: string }
  | { kind: "location"; destination: AssistantPlace }
  | { kind: "choose"; field: "origin" | "destination"; choices: AssistantPlace[]; destination?: AssistantPlace; originQuery?: string }
  | AssistantJourneyPlans;
