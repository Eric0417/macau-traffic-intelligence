import { afterEach, describe, expect, it, vi } from "vitest";
import { loadRoads } from "@/server/sources/roads";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadRoads", () => {
  it("normalizes official road levels into GeoJSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: [
              {
                reid: "1",
                twName: "關閘廣場",
                cnName: "关闸广场",
                ptName: "Praça das Portas do Cerco",
                enName: "Praça das Portas do Cerco",
                trafficLevel: 3,
                coordinate: "113.5472,22.2158;113.5477,22.2159",
                length: 54.2,
                isShowName: "1",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const roads = await loadRoads();

    expect(roads.features).toHaveLength(1);
    expect(roads.features[0].properties).toMatchObject({
      id: "1",
      status: "congested",
      officialLevel: 3,
      nameVisible: true,
    });
    expect(roads.features[0].geometry.coordinates).toEqual([
      [113.5472, 22.2158],
      [113.5477, 22.2159],
    ]);
  });

  it("accepts null labels and visibility flags returned by the live API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          success: true,
          data: [
            {
              reid: "2",
              twName: null,
              cnName: null,
              ptName: null,
              enName: null,
              trafficLevel: -1,
              coordinate: "113.55,22.19;113.56,22.20",
              length: 20,
              isShowName: null,
            },
          ],
        }),
      ),
    );

    const roads = await loadRoads();

    expect(roads.features[0].properties).toMatchObject({
      name: { "zh-Hant": "", "zh-Hans": "", en: "" },
      nameVisible: false,
      status: "unknown",
    });
  });
});
