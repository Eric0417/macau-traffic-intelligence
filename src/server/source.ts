import "server-only";
import type { z } from "zod";
import type { SourceAttribution } from "@/lib/types";

export interface SourceDefinition<T> {
  id: string;
  cacheVersion?: string;
  name: string;
  url: string;
  attribution: string;
  envKey: string;
  ttlSeconds: number;
  staleTtlSeconds: number;
  schema: z.ZodType<T>;
  load: (previous?: { data: unknown; updatedAt: string }) => Promise<T>;
}

export interface SourceData<T> {
  data: T;
  attribution: SourceAttribution;
  updatedAt: string;
  stale: boolean;
  ttlSeconds: number;
}

export function sourceAttribution<T>(source: SourceDefinition<T>): SourceAttribution {
  return {
    id: source.id,
    name: source.name,
    url: source.url,
    text: source.attribution,
  };
}
