import { expect, test } from "@playwright/test";
import { mockDashboard, meta } from "./fixtures";

test("shows labelled minutes, then falls back when predictions are old or stops suspended", async ({ page }) => {
  await mockDashboard(page);
  let mode: "fresh" | "stale" | "suspended" = "fresh";
  await page.route("**/api/v1/bus/routes/*/eta?*", route => route.fulfill({ json: {
    meta: { ...meta({ id: "bus-eta-00003-0", name: "Bus data", url: "https://example.com" }), ttlSeconds: 2 },
    data: { routeCode: "00003", routeName: "3", direction: 0, vehicles: [], routeSegments: [], diversion: { suspendedStops: [] },
      stops: [{ sequence: 0, stationCode: "M1/9", stationName: "關閘總站", coordinates: [113.54918,22.215502], trafficLevel: 1, trafficStatus: "normal", stopsAway: 2, suspended: mode === "suspended", arrivalEstimate: { minutes: 4, generatedAt: new Date(Date.now() - (mode === "stale" ? 60_000 : 0)).toISOString(), vehicleId: "v", basis: "reported-speed" } }],
    },
  }}));
  await page.goto("/");
  await page.getByRole("tab", { name: "巴士", exact: true }).click();
  await page.locator(".route-grid button").first().click();
  await page.locator(".stop-row").click();
  const card = page.locator(".waiting-card");
  await expect(card).toContainText("約 4 分鐘");
  await expect(card).toContainText("系統估算");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `docs/qa/bus-prediction/${test.info().project.name}.png` });
  mode = "stale";
  await expect(card).not.toContainText("系統估算", { timeout: 12_000 });
  await expect(card.locator(".waiting-number")).toContainText("2");
  mode = "suspended";
  await expect(card).toContainText("暫停", { timeout: 12_000 });
  await expect(card).not.toContainText("約 4 分鐘");
});
