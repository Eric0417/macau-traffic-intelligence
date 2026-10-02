import "server-only";
import { z } from "zod";
import { borderStatusSchema } from "@/lib/contracts";
import type { BorderStatus, LocalizedText } from "@/lib/types";
import { fetchJson } from "@/server/http";
import type { SourceDefinition } from "@/server/source";

const BASE_URL = "https://www.fsm.gov.mo/psp/pspmonitor/mobile";
const STATUS_ENDPOINT = "https://www.fsm.gov.mo/psp/pspmonitor/webservice.asmx/getStatus";

const borderDefinitions: Array<{
  id: string;
  file: string;
  name: LocalizedText;
  statusIds: string[];
}> = [
  {
    id: "portas-do-cerco",
    file: "PortasdoCerco.aspx",
    name: {
      "zh-Hant": "關閘",
      "zh-Hans": "关闸",
      pt: "Portas do Cerco",
      en: "Portas do Cerco",
    },
    statusIds: ["2", "7"],
  },
  {
    id: "hengqin",
    file: "Cotai.aspx",
    name: {
      "zh-Hant": "橫琴口岸",
      "zh-Hans": "横琴口岸",
      pt: "Posto Fronteiriço de Hengqin",
      en: "Hengqin Port",
    },
    statusIds: ["5", "263", "264", "265"],
  },
  {
    id: "hzmb",
    file: "hzm.aspx",
    name: {
      "zh-Hant": "港珠澳大橋",
      "zh-Hans": "港珠澳大桥",
      pt: "Ponte Hong Kong-Zhuhai-Macau",
      en: "HZMB Port",
    },
    statusIds: ["16", "17", "18", "19", "22", "23", "25", "261", "262"],
  },
  {
    id: "qingmao",
    file: "PortoQingmao.aspx",
    name: {
      "zh-Hant": "青茂口岸",
      "zh-Hans": "青茂口岸",
      pt: "Posto Fronteiriço de Qingmao",
      en: "Qingmao Port",
    },
    statusIds: ["55"],
  },
  {
    id: "industrial-park",
    file: "industrial.aspx",
    name: {
      "zh-Hant": "珠澳跨境工業區",
      "zh-Hans": "珠澳跨境工业区",
      pt: "Parque Industrial Transfronteiriço",
      en: "Cross-border Industrial Park",
    },
    statusIds: ["8", "271", "281"],
  },
  {
    id: "outer-harbour",
    file: "PortoExterior.aspx",
    name: {
      "zh-Hant": "外港客運碼頭",
      "zh-Hans": "外港客运码头",
      pt: "Terminal Marítimo do Porto Exterior",
      en: "Outer Harbour Ferry Terminal",
    },
    statusIds: ["1"],
  },
  {
    id: "taipa-ferry",
    file: "PortoTaipa.aspx",
    name: {
      "zh-Hant": "氹仔客運碼頭",
      "zh-Hans": "氹仔客运码头",
      pt: "Terminal Marítimo da Taipa",
      en: "Taipa Ferry Terminal",
    },
    statusIds: ["12"],
  },
  {
    id: "inner-harbour",
    file: "PortoInterior.aspx",
    name: {
      "zh-Hant": "內港客運碼頭",
      "zh-Hans": "内港客运码头",
      pt: "Terminal Marítimo do Porto Interior",
      en: "Inner Harbour Ferry Terminal",
    },
    statusIds: ["3"],
  },
];

const envelopeSchema = z.object({
  d: z.string(),
});

const statusSchema = z.object({
  Rs: z.boolean(),
  Rt: z.array(
    z.object({
      Pn: z.string(),
      Id: z.enum(["D", "E"]),
      St: z.string(),
      Ti: z.string(),
      Vt: z.string(),
      Os: z.string(),
      Mp: z.string(),
      Mc: z.string(),
    }),
  ),
});

const statusRank: Record<string, number> = {
  "0": 0,
  "100": 0,
  "6": 1,
  "1": 2,
  "2": 3,
  "3": 4,
  "4": 5,
  "5": 6,
  "8": 6,
  "7": 7,
};

function mapStatus(code: string): BorderStatus["status"] {
  if (code === "1") return "clear";
  if (code === "2" || code === "3") return "busy";
  if (code === "4") return "very_busy";
  if (code === "5" || code === "7" || code === "8") return "closed";
  return "unknown";
}

function estimatedWait(code: string): number | null {
  if (code === "1") return 10;
  if (code === "2") return 30;
  if (code === "3") return 45;
  if (code === "4") return 60;
  return null;
}

function timestamp(value: string): string | null {
  const match = value.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeBorderStatuses(payload: unknown): BorderStatus[] {
  const parsed = statusSchema.parse(payload);

  return borderDefinitions.map((definition) => {
    const statuses = parsed.Rt.filter((status) => definition.statusIds.includes(status.Pn));
    const current = statuses.filter((status) => status.Os !== "1");
    const selected = current.length ? current : statuses;
    const worst = [...selected].sort(
      (a, b) => (statusRank[b.St] ?? 0) - (statusRank[a.St] ?? 0),
    )[0];
    const updatedAt =
      selected
        .map((status) => timestamp(status.Ti))
        .filter((value): value is string => value !== null)
        .sort()
        .at(-1) ?? null;

    return borderStatusSchema.parse({
      id: definition.id,
      name: definition.name,
      status: worst ? mapStatus(worst.St) : "unknown",
      estimatedWaitMinutes: worst ? estimatedWait(worst.St) : null,
      updatedAt,
      sourceUrl: `${BASE_URL}/${definition.file}`,
    });
  });
}

export async function loadBorders() {
  const envelope = envelopeSchema.parse(
    await fetchJson(STATUS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: "{}",
      timeoutMs: 8_000,
    }),
  );

  let payload: unknown;
  try {
    payload = JSON.parse(envelope.d);
  } catch {
    throw new Error("Border status service returned invalid JSON");
  }

  return normalizeBorderStatuses(payload);
}

export const bordersSource: SourceDefinition<Awaited<ReturnType<typeof loadBorders>>> = {
  id: "borders",
  name: "治安警察局出入境事務站",
  url: `${BASE_URL}/`,
  attribution: "治安警察局出入境事務站實時資訊平台",
  envKey: "SOURCE_BORDERS_ENABLED",
  ttlSeconds: 60,
  staleTtlSeconds: 1_800,
  schema: z.array(borderStatusSchema),
  load: loadBorders,
};
