import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCameras } from "@/server/sources/cameras";

afterEach(() => {
  vi.unstubAllGlobals();
});

function rawCamera(overrides: Record<string, unknown> = {}) {
  return {
    id: "1",
    nameCN: "關閘廣場",
    nameTW: "關閘廣場",
    namePT: "",
    nameEN: "",
    lng: "113.5472",
    lat: "22.2158",
    locationCN: "關閘廣場",
    locationTW: "關閘廣場",
    locationPT: "",
    locationEN: "",
    camUrl: "https://streaming1.dsatmacau.com/traffic/p1001.m3u8",
    camType: "1",
    camZoneCN: "北區",
    camZoneTW: "北區",
    camZonePT: "",
    camZoneEN: "",
    camZoneSubCN: "關閘",
    camZoneSubTW: "關閘",
    camZoneSubPT: "",
    camZoneSubEN: "",
    ...overrides,
  };
}

function stubCameraResponse(data: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        header: { status: "000" },
        data,
      }),
    ),
  );
}

describe("loadCameras", () => {
  it("assigns unique ids to cameras the catalog lists once per zone", async () => {
    stubCameraResponse([
      rawCamera(),
      rawCamera({ camZoneTW: "離島區", camZoneSubTW: "路氹" }),
      rawCamera({ id: "2", camUrl: "https://streaming1.dsatmacau.com/traffic/p1002.m3u8" }),
      rawCamera({ id: "2", camUrl: "https://streaming1.dsatmacau.com/traffic/p1002.m3u8" }),
      rawCamera({ id: "3", camType: "2" }),
      rawCamera({ id: "4", camUrl: "https://example.com/not-hls.mp4" }),
    ]);

    const cameras = await loadCameras();
    const ids = cameras.map((camera) => camera.id);

    expect(cameras).toHaveLength(3);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toMatch(/^1-[0-9a-f]{6}$/);
    expect(ids[1]).toMatch(/^1-[0-9a-f]{6}$/);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[2]).toBe("2");
  });

  it("keeps coordinates and stream urls valid for playback", async () => {
    stubCameraResponse([rawCamera()]);

    const cameras = await loadCameras();

    expect(cameras).toHaveLength(1);
    expect(cameras[0].coordinates).toEqual([113.5472, 22.2158]);
    expect(Number.isFinite(cameras[0].coordinates[0])).toBe(true);
    expect(Number.isFinite(cameras[0].coordinates[1])).toBe(true);
    expect(cameras[0].streamUrl.endsWith(".m3u8")).toBe(true);
    expect(cameras[0].mediaType).toBe("hls");
  });
});
