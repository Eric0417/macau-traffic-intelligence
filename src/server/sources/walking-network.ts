import "server-only";
import { z } from "zod";
import snapshot from "../../../data/walking-network.json";
import type { WalkingNetwork } from "@/lib/walking-network";
import type { SourceDefinition } from "@/server/source";

const coordinates = z.tuple([z.number().min(113.4).max(113.7), z.number().min(22).max(22.3)]);

export const walkingNetworkSchema = z.object({
  mappedAt: z.iso.datetime(),
  places: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    aliases: z.array(z.string()),
    coordinates,
    context: z.string(),
    approximate: z.boolean().optional(),
    street: z.boolean().optional(),
  })).min(1),
  nodes: z.array(coordinates).min(2),
  edges: z.array(z.tuple([
    z.number().int().nonnegative(), z.number().int().nonnegative(),
    z.union([z.literal(0), z.literal(1), z.literal(2)]), z.boolean(),
  ])).min(1),
}).refine(({ nodes, edges }) => edges.every(([a, b]) => a !== b && a < nodes.length && b < nodes.length), {
  path: ["edges"], message: "Walking edges must connect valid, distinct nodes",
});

export const walkingNetworkSource: SourceDefinition<WalkingNetwork> = {
  id: "walking-network",
  cacheVersion: "unlocked-gates-v2",
  name: "OpenStreetMap Macau places and pedestrian network",
  url: "https://www.openstreetmap.org/copyright",
  attribution: "© OpenStreetMap contributors, ODbL. Macau extract by Geofabrik.",
  envKey: "SOURCE_WALKING_ENABLED",
  ttlSeconds: 86_400,
  staleTtlSeconds: 2_592_000,
  schema: walkingNetworkSchema,
  load: async () => walkingNetworkSchema.parse(snapshot),
};
