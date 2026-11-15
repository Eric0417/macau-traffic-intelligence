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

test("keeps uncertain arrivals separate from a changed bus", async ({ page }) => {
  await mockDashboard(page);
  let phase: "minute" | "stopped" | "updating" | "next" = "minute";
  await page.route("**/api/v1/bus/routes/*/eta?*", route => route.fulfill({ json: {
    meta: { ...meta({ id: "bus-eta-00003-0", name: "Bus data", url: "https://example.com" }), ttlSeconds: 2 },
    data: { routeCode: "00003", routeName: "3", direction: 0, vehicles: [], routeSegments: [], diversion: { suspendedStops: [] },
      stops: [{ sequence: 0, stationCode: "M1/9", stationName: "關閘總站", coordinates: [113.54918,22.215502], trafficLevel: 1, trafficStatus: "normal", stopsAway: 0, suspended: false,
        arrivalEstimate: phase === "minute" || phase === "next" ? { minutes: phase === "minute" ? 1 : 15, generatedAt: new Date().toISOString(), vehicleId: phase === "minute" ? "first" : "second", basis: "reported-speed", nextBus: phase === "next" } : null,
        arrivalStatus: phase === "stopped" || phase === "updating" ? { state: phase === "stopped" ? "near-stop" : "updating", vehicleId: "first", generatedAt: new Date().toISOString(), since: new Date().toISOString() } : null,
      }],
    },
  }}));
  await page.goto("/");
  await page.getByRole("tab", { name: "巴士", exact: true }).click();
  await page.locator(".route-grid button").first().click();
  await page.locator(".stop-row").click();
  const card = page.locator(".waiting-card");
  await expect(card).toContainText("約 1 分鐘");
  phase = "stopped";
  await expect(card).toContainText("站點附近停留中", { timeout: 12_000 });
  await expect(card).not.toContainText("15 分鐘");
  phase = "updating";
  await expect(card).toContainText("到站時間更新中", { timeout: 12_000 });
  await expect(card).toContainText("暫未能估算分鐘");
  expect(await card.locator(".waiting-number").evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.screenshot({ path: `docs/qa/bus-stability/${test.info().project.name}-updating.png` });
  phase = "next";
  await expect(card).toContainText("約 15 分鐘", { timeout: 12_000 });
  await expect(card).toContainText("班次已更新");
});
