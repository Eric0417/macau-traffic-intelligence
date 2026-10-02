import "server-only";
import { z } from "zod";
import { bridgeTimeSchema } from "@/lib/contracts";
import type { LocalizedText, TrafficStatus } from "@/lib/types";
import { fetchJson } from "@/server/http";
import type { SourceDefinition } from "@/server/source";

const rawBridgeSchema = z.object({
  name: z.string(),
  direction: z.enum(["N", "S"]),
  runtime: z.coerce.number().nonnegative(),
  level: z.coerce.number(),
});

const responseSchema = z.object({
  success: z.boolean(),
  data: z.array(rawBridgeSchema),
});

const bridgeNames: Record<string, LocalizedText> = {
  西灣大橋: {
    "zh-Hant": "西灣大橋",
    "zh-Hans": "西湾大桥",
    pt: "Ponte de Sai Van",
    en: "Sai Van Bridge",
  },
  嘉樂庇大橋: {
    "zh-Hant": "嘉樂庇大橋",
    "zh-Hans": "嘉乐庇大桥",
    pt: "Ponte Governador Nobre de Carvalho",
    en: "Governor Nobre de Carvalho Bridge",
  },
  友誼大橋: {
    "zh-Hant": "友誼大橋",
    "zh-Hans": "友谊大桥",
    pt: "Ponte de Amizade",
    en: "Friendship Bridge",
  },
  澳門大橋: {
    "zh-Hant": "澳門大橋",
    "zh-Hans": "澳门大桥",
    pt: "Ponte de Macau",
    en: "Macau Bridge",
  },
};

function statusFromLevel(level: number): TrafficStatus {
  if (level === 1) return "normal";
  if (level === 2) return "slow";
  if (level === 3) return "congested";
  return "unknown";
}

function bridgeId(name: string, direction: "N" | "S"): string {
  const slug =
    Object.entries(bridgeNames).find(([, value]) => value["zh-Hant"] === name)?.[0] ??
    name;
  return `${slug}-${direction.toLowerCase()}`;
}

export async function loadBridges() {
  const response = responseSchema.parse(
    await fetchJson("https://bis.dsat.gov.mo/api/Service/RoadTrafficSimpleGraph_BridTime"),
  );

  return response.data.map((bridge) =>
    bridgeTimeSchema.parse({
      id: bridgeId(bridge.name, bridge.direction),
      name: bridgeNames[bridge.name] ?? {
        "zh-Hant": bridge.name,
        "zh-Hans": bridge.name,
        en: bridge.name,
      },
      direction: bridge.direction === "N" ? "northbound" : "southbound",
      runtimeSeconds: bridge.runtime,
      status: statusFromLevel(bridge.level),
      officialLevel: bridge.level,
    }),
  );
}

export const bridgesSource: SourceDefinition<Awaited<ReturnType<typeof loadBridges>>> = {
  id: "bridges",
  name: "DSAT 跨海大橋行車時間",
  url: "https://bis.dsat.gov.mo/trafficmap/",
  attribution: "交通事務局發佈的四條跨海大橋即時行車時間",
  envKey: "SOURCE_BRIDGES_ENABLED",
  ttlSeconds: 60,
  staleTtlSeconds: 900,
  schema: z.array(bridgeTimeSchema),
  load: loadBridges,
};
