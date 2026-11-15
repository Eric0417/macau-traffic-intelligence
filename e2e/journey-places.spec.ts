import { expect, test } from "@playwright/test";
import { meta, mockDashboard } from "./fixtures";
import { openManualBusPlanner } from "./navigation";
import type { WalkingNetwork } from "../src/lib/walking-network";

const walking: WalkingNetwork = {
  mappedAt: "2026-11-09T21:22:17Z",
  places: [
    { id: "n1", name: "北區測試公園", aliases: ["North Park"], coordinates: [113.54918, 22.2165], context: "" },
    { id: "n2", name: "南區測試圖書館", aliases: ["South Library"], coordinates: [113.529, 22.18], context: "" },
  ],
  nodes: [
    [113.54918, 22.2165], [113.54918, 22.215502], [113.54, 22.19],
    [113.53, 22.18], [113.529, 22.18],
  ],
  edges: [[0, 1, 0, true], [1, 2, 0, true], [2, 3, 0, true], [3, 4, 0, true]],
};

test("finds a named destination and compares walking with bus transfers", async ({ page, isMobile }) => {
  await mockDashboard(page);
  await page.route("**/api/v1/journeys/walking-network", (route) => route.fulfill({
    json: { data: walking, meta: meta({ id: "walking-network", name: "OSM fixture", url: "https://www.openstreetmap.org/copyright" }) },
  }));
  await page.goto("/");
  await openManualBusPlanner(page);
  await page.getByRole("searchbox", { name: "起點", exact: true }).fill("北區測試公園");
  await page.getByRole("button", { name: "北區測試公園 地點" }).click();
  await page.getByRole("searchbox", { name: "終點", exact: true }).fill("South Library");
  await page.getByRole("button", { name: "南區測試圖書館 地點" }).click();
  await page.getByRole("button", { name: "尋找行程方案" }).click();

  const bus = page.getByRole("article", { name: "方案 1" });
  await expect(bus.locator(".journey-route-kind")).toHaveText("轉乘 · 1");
  await expect(bus).toContainText("步行到上車站");
  await expect(bus).toContainText("落車後步行到目的地");
  await expect(bus).toContainText("測試轉乘站");
  await page.getByRole("article", { name: "全程步行" }).getByRole("button", { name: "地圖與步驟" }).click();
  await expect(page.locator(".map-context")).toContainText("綠線");
  if (isMobile) await page.getByRole("button", { name: "查看行程步驟 →" }).click();
  await expect(page.locator(".journey-map-detail")).toContainText("全程步行 · 南區測試圖書館");
  await expect(page.locator(".journey-map-detail")).toContainText("估計步行距離");
  await page.getByRole("button", { name: "返回方案", exact: true }).click();
  await expect(page.getByRole("searchbox", { name: "終點", exact: true })).toHaveValue("南區測試圖書館");
  await expect(bus).toBeVisible();
});
