import { bridgesSource } from "../src/server/sources/bridges";
import { bordersSource } from "../src/server/sources/borders";
import { busRoutesSource } from "../src/server/sources/bus";
import { camerasSource } from "../src/server/sources/cameras";
import { lrtNetworkSource, lrtNoticesSource } from "../src/server/sources/lrt";
import { noticesSource } from "../src/server/sources/notices";
import { parkingSource } from "../src/server/sources/parking";
import { roadsSource } from "../src/server/sources/roads";
import { weatherSource } from "../src/server/sources/weather";
import type { SourceDefinition } from "../src/server/source";

function itemCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (
    value &&
    typeof value === "object" &&
    "features" in value &&
    Array.isArray((value as { features?: unknown[] }).features)
  ) {
    return (value as { features: unknown[] }).features.length;
  }
  return 1;
}

const checks: Array<{ source: SourceDefinition<unknown>; optional?: boolean }> = [
  { source: roadsSource },
  { source: bridgesSource },
  { source: camerasSource },
  { source: busRoutesSource },
  { source: parkingSource },
  { source: weatherSource },
  { source: noticesSource },
  { source: lrtNetworkSource },
  { source: lrtNoticesSource },
  { source: bordersSource, optional: true },
];

async function main() {
  const results = await Promise.all(
    checks.map(async ({ source, optional }) => {
      const startedAt = Date.now();
      try {
        const data = await source.load();
        return {
          id: source.id,
          status: "ok",
          optional: Boolean(optional),
          itemCount: itemCount(data),
          durationMs: Date.now() - startedAt,
        };
      } catch (error) {
        return {
          id: source.id,
          status: "failed",
          optional: Boolean(optional),
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));

  if (results.some((result) => result.status === "failed" && !result.optional)) {
    process.exitCode = 1;
  }
}

void main();
