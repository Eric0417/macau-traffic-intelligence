import { describe, expect, it, vi } from "vitest";
import { loadLrtNetwork } from "@/server/sources/lrt";
import {
  buildLrtNetwork,
  isUsableLrtNetwork,
  lrtNetworkFallback,
} from "@/server/sources/lrt-network";

const fixture = {
  elements: [
    {
      type: "relation",
      id: 100,
      tags: {
        route: "light_rail",
        ref: "Taipa",
        colour: "#96C93C",
        "name:zh": "氹仔線（氹仔碼頭=>媽閣）",
        "name:en": "Taipa Line (Taipa Ferry Terminal → Barra)",
        "name:pt": "Linha da Taipa",
      },
      members: [
        { type: "way", ref: 200, role: "" },
        { type: "node", ref: 1, role: "stop" },
        { type: "node", ref: 2, role: "stop" },
      ],
    },
    {
      type: "relation",
      id: 101,
      tags: {
        route: "light_rail",
        ref: "Seac Pai Van",
        colour: "#8966C3",
        "name:zh": "石排灣線",
        "name:en": "Seac Pai Van Line",
      },
      members: [
        { type: "way", ref: 201, role: "" },
        { type: "node", ref: 3, role: "stop" },
        { type: "node", ref: 4, role: "stop" },
        { type: "node", ref: 5, role: "stop" },
      ],
    },
    { type: "way", id: 200, nodes: [1, 2] },
    { type: "way", id: 201, nodes: [3, 4, 5] },
    {
      type: "node",
      id: 1,
      lat: 22.1630017,
      lon: 113.5741204,
      tags: { "name:zh": "氹仔碼頭", "name:en": "Taipa Ferry Terminal" },
    },
    // The Overpass geometry recursion repeats nodes without tags.
    { type: "node", id: 1, lat: 22.1630017, lon: 113.5741204 },
    {
      type: "node",
      id: 2,
      lat: 22.1387456,
      lon: 113.5630495,
      tags: { "name:zh": "協和醫院", "name:en": "Union Hospital" },
    },
    {
      type: "node",
      id: 3,
      lat: 22.1314553,
      lon: 113.56185,
      tags: { "name:zh": "石排灣", "name:en": "Seac Pai Van" },
    },
    {
      type: "node",
      id: 4,
      lat: 22.1379315,
      lon: 113.5632219,
      tags: { "name:zh": "協和醫院", "name:en": "Union Hospital" },
    },
    {
      type: "node",
      id: 5,
      lat: 22.13,
      lon: 113.56,
      tags: { "name:zh": "新城測試", "name:en": "New Town Test" },
    },
  ],
};

function fallbackPayload() {
  const elements: unknown[] = [];
  let wayId = 10_000;
  let relationId = 20_000;
  let nodeId = 1;
  for (const line of lrtNetworkFallback.lines.features) {
    const ref = line.properties.ref;
    const stations = lrtNetworkFallback.stations.filter((station) =>
      station.lines.includes(ref),
    );
    const nodeIds: number[] = [];
    const members: Array<{ type: string; ref: number; role: string }> = [];
    for (const station of stations) {
      elements.push({
        type: "node",
        id: nodeId,
        lat: station.coordinates[1],
        lon: station.coordinates[0],
        tags: {
          "name:zh": station.name["zh-Hant"],
          "name:en": station.name.en,
          ...(station.name.pt ? { "name:pt": station.name.pt } : {}),
        },
      });
      nodeIds.push(nodeId);
      members.push({ type: "node", ref: nodeId, role: "stop" });
      nodeId += 1;
    }
    members.push({ type: "way", ref: wayId, role: "" });
    elements.push({ type: "way", id: wayId, nodes: nodeIds });
    elements.push({
      type: "relation",
      id: relationId,
      tags: {
        route: "light_rail",
        ref,
        colour: line.properties.color,
        "name:zh": line.properties.name["zh-Hant"],
        "name:en": line.properties.name.en,
      },
      members,
    });
    wayId += 1;
    relationId += 1;
  }
  return { elements };
}

describe("LRT network", () => {
  it("ships a usable fallback with the three operating lines and 15 stations", () => {
    expect(isUsableLrtNetwork(lrtNetworkFallback)).toBe(true);
    expect(lrtNetworkFallback.lines.features).toHaveLength(3);
    expect(lrtNetworkFallback.stations).toHaveLength(15);
    expect(lrtNetworkFallback.stations.filter((station) => station.interchange)).toHaveLength(2);
  });

  it("builds lines and stops from an Overpass payload", () => {
    const network = buildLrtNetwork(fixture);

    expect(network.lines.features.map((line) => line.properties.ref)).toEqual([
      "Taipa",
      "Seac Pai Van",
    ]);
    expect(network.lines.features[0].properties.color).toBe("#96C93C");
    expect(network.lines.features[0].properties.name["zh-Hant"]).toContain("氹仔線");
    expect(network.stations[0].id).toBe("TFT");
  });

  it("merges same-named stops within 400 m into one interchange", () => {
    const network = buildLrtNetwork(fixture);
    const interchange = network.stations.find((station) => station.id === "HU");

    expect(interchange?.interchange).toBe(true);
    expect(interchange?.lines).toEqual(["Taipa", "Seac Pai Van"]);
  });

  it("keeps new stations from the live payload with a converted name", () => {
    const network = buildLrtNetwork(fixture);
    const added = network.stations.find((station) => station.id === "osm-5");

    expect(added?.name["zh-Hant"]).toBe("新城測試");
    expect(added?.name["zh-Hans"]).toBe("新城测试");
  });

  it("rejects a partial network as unusable", () => {
    const network = buildLrtNetwork(fixture);
    const partial = {
      ...network,
      lines: {
        ...network.lines,
        features: network.lines.features.slice(0, 2),
      },
    };

    expect(isUsableLrtNetwork(partial)).toBe(false);
  });

  it("falls back to the second Overpass mirror when the first fails", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("primary down"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => fallbackPayload(),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);
    try {
      const network = await loadLrtNetwork();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(network.lines.features).toHaveLength(3);
      expect(network.stations).toHaveLength(15);
      expect(network.sourceUpdatedAt).not.toBe(lrtNetworkFallback.sourceUpdatedAt);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("falls back to the checked-in network when every Overpass mirror is unavailable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    try {
      const network = await loadLrtNetwork();
      expect(network).toEqual(lrtNetworkFallback);
      expect(warn).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      warn.mockRestore();
    }
  });
});
