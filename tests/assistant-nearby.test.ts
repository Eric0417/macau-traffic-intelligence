import { afterEach, expect, it, vi } from "vitest";
import * as assistant from "@/server/sources/assistant";
import * as cache from "@/server/cache";
import { planAssistantJourney } from "@/server/sources/assistant-journeys";
import { planNearby } from "@/server/sources/assistant-nearby";
import type { ParkingFacility } from "@/lib/types";

const origin: [number, number] = [113.54, 22.19];
const availability = { lightVehicle: 0, motorcycle: null, electricVehicle: null, electricMotorcycle: null, accessible: null, heavyVehicleShort: null, heavyVehicleLong: null };
const facilities: ParkingFacility[] = [
  { id: "near", name: "附近停車場", coordinates: [113.541, 22.19], updatedAt: null, areaStatus: "unknown", availability },
  { id: "open", name: "有位停車場", coordinates: [113.542, 22.19], updatedAt: null, areaStatus: "green", availability: { ...availability, lightVehicle: 12 } },
  { id: "far", name: "遠處停車場", coordinates: [113.6, 22.1], updatedAt: null, areaStatus: "green", availability },
  { id: "unmapped", name: "未定位停車場", coordinates: null, updatedAt: null, areaStatus: "green", availability },
  { id: "coaches", name: "上落客區(重型客車)", coordinates: origin, updatedAt: null, areaStatus: "green", availability },
];
afterEach(() => vi.restoreAllMocks());

it("asks for location for nearby parking and nearby bus stops before reading unrelated feeds", async () => {
  const read = vi.spyOn(cache, "readSource");
  for (const intent of ["parking", "bus-stops"]) {
    vi.spyOn(assistant, "callAssistantProvider").mockResolvedValue(JSON.stringify({ intent }));
    expect((await planAssistantJourney({ question: "附近有什麼？", locale: "zh-Hant" })).data.kind).toBe("nearby-location");
  }
  expect(read).not.toHaveBeenCalled();
});

it("grounds nearby parking in distances, preserves zero and unknown counts, and exposes stale data", async () => {
  vi.spyOn(cache, "readSource").mockResolvedValue({ result: { data: facilities, updatedAt: "2026-11-15T03:00:00Z", stale: true } } as never);
  vi.spyOn(assistant, "callAssistantProvider").mockImplementation(async messages => {
    const c = JSON.parse(messages[1].content);
    expect(c.candidates.map((p: { id: string }) => p.id)).toEqual(["near", "open"]);
    expect(c.candidates[0].distanceMeters).toBeGreaterThan(100);
    expect(c.candidates[0].detail).toContain("輕型車 0");
    expect(c.candidates[0].detail).toContain("電單車 未提供");
    expect(c.stale).toBe(true);
    return JSON.stringify({ summary: "車位資料延遲，請先核對", ids: ["open", "near"] });
  });
  const { data } = await planNearby({ question: "附近邊度仲有車位", locale: "zh-Hant", origin }, "parking");
  expect(data.kind).toBe("nearby");
  if (data.kind !== "nearby") return;
  expect(data.answer.answer).toContain("輕型車 12");
  expect(data.answer.answer).toContain("資料延遲");
  expect(data.answer.answer).toContain("UTC+08:00");
  expect(data.answer.answer).not.toContain("遠處停車場");
});

it("resolves a typed nearby landmark without device location and lists the actual stop routes", async () => {
  const place = { id: "landmark", name: "地標", aliases: [], context: "", coordinates: origin };
  const read = vi.spyOn(cache, "readSource").mockImplementation(async source => ({ result: { data: source.id === "walking-network" ? { places: [place] } : {
    fetchedAt: "2026-11-10T00:00:00Z", routes: [{ routeName: "56", stops: [{ stationCode: "M1", stationName: "附近站", coordinates: origin }] }],
  }, updatedAt: "2026-11-15T00:00:00Z", stale: false } }) as never);
  vi.spyOn(assistant, "callAssistantProvider").mockImplementation(async messages => {
    const c = JSON.parse(messages[1].content);
    expect(c.candidates[0]).toMatchObject({ id: "M1", detail: "56", distanceMeters: 0 });
    return JSON.stringify({ summary: "地標旁有巴士站，班次需另查", ids: ["M1"] });
  });
  const { data } = await planNearby({ question: "地標附近有咩站", locale: "zh-Hant" }, "bus-stops", "地標");
  expect(data.kind).toBe("nearby");
  expect(read.mock.calls.every(([source]) => ["bus-network", "walking-network"].includes(source.id))).toBe(true);
});

it("rejects model-invented facilities and distinguishes unavailable data from no spaces", async () => {
  const read = vi.spyOn(cache, "readSource").mockResolvedValue({ result: { data: facilities, updatedAt: "2026-11-15T03:00:00Z", stale: false } } as never);
  vi.spyOn(assistant, "callAssistantProvider").mockResolvedValue(JSON.stringify({ summary: "附近", ids: ["invented"] }));
  await expect(planNearby({ question: "附近停車場", locale: "zh-Hant", origin }, "parking")).rejects.toThrow("assistant_unknown_facility");
  read.mockResolvedValue(null);
  expect((await planNearby({ question: "附近停車場", locale: "zh-Hant", origin }, "parking")).data).toMatchObject({ kind: "clarify", message: expect.stringContaining("暫時未能讀取") });
});
