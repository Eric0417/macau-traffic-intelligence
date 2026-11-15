import { openManualBusPlanner, toggleTheme } from "./navigation";
import { expect, test, type Page } from "@playwright/test";
import { mockDashboard, meta } from "./fixtures";
import { JOURNEY_COLORS } from "../src/components/dashboard/journey-map";

async function choose(page: Page, label: string, code: string, name: string) {
  await page.getByRole("searchbox", { name: label, exact: true }).fill(code);
  await page.getByRole("list", { name: label, exact: true }).getByRole("button", { name }).click();
}

async function journeyGeometry(page: Page, failSecond = false, freshness?: () => { stale: boolean; ageMs: number }) {
  const points: [number, number][] = [[113.54918, 22.215502], [113.54, 22.19], [113.53, 22.18]];
  await page.route("**/api/v1/bus/routes/*/eta**", async (route) => {
    const second = route.request().url().includes("00008");
    if (second && failSecond) { await route.fulfill({ status: 503, json: { message: "Fixture unavailable" } }); return; }
    const code = second ? "00008" : "00003";
    const start = second ? 1 : 0;
    const codes = ["M1/9", "M2", "M3"];
    const names = ["關閘總站", "測試轉乘站", "測試終點站"];
    const timing = freshness?.();
    await route.fulfill({ json: { data: {
      routeName: second ? "8" : "3", routeCode: code, direction: second ? 1 : 0,
      stops: [start, start + 1].map((index, sequence) => ({ sequence, stationCode: codes[index], stationName: names[index], coordinates: points[index], stopsAway: 0, suspended: false, trafficStatus: "normal", trafficLevel: 1 })),
      routeSegments: [{ fromStationCode: codes[start], toStationCode: codes[start + 1], trafficStatus: "normal", trafficLevel: 1, coordinates: [points[start], points[start + 1]] }],
      vehicles: [{
        id: second ? "8-bus" : "3-bus", plate: second ? "AA0008" : "AA0003",
        stationCode: codes[start + 1], stationName: names[start + 1], positionSource: "feed",
        coordinates: points[start].map((coordinate, axis) => (coordinate + points[start + 1][axis]) / 2),
      }],
      diversion: { suspendedStops: [] },
    }, meta: { ...meta({ id: `bus-eta-${code}`, name: "Fixture official geometry", url: "https://example.com/" }), ...(timing ? { stale: timing.stale, ttlSeconds: 2, updatedAt: new Date(Date.now() - timing.ageMs).toISOString() } : {}) } } });
  });
}

async function plan(page: Page) {
  await choose(page, "起點", "M1/9", "關閘總站 M1/9");
  await choose(page, "終點", "M3", "測試終點站 M3");
  await page.getByRole("button", { name: "尋找行程方案" }).click();
}

async function colourPixels(page: Page, colour: string, extent = false) {
  // Mask controls that overlap the canvas, since their orange text is not route geometry.
  const png = await page.locator(".maplibregl-canvas").screenshot({ mask: [page.locator(".map-context"), page.locator(".workspace-map-top")] });
  return page.evaluate(async ({ base64, colour, extent }) => {
    const img = new Image(); img.src = `data:image/png;base64,${base64}`; await img.decode();
    const canvas = document.createElement("canvas"); canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext("2d")!; ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const rgb = [1, 3, 5].map((offset) => parseInt(colour.slice(offset, offset + 2), 16));
    let count = 0;
    let minX = canvas.width, maxX = 0, minY = canvas.height, maxY = 0;
    for (let i = 0; i < data.length; i += 4) if (rgb.every((value, channel) => Math.abs(data[i + channel] - value) < 12)) {
      count += 1;
      const x = (i / 4) % canvas.width, y = Math.floor(i / 4 / canvas.width);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    return extent ? (count ? Math.max(maxX - minX + 1, maxY - minY + 1) / devicePixelRatio : 0) : count;
  }, { base64: png.toString("base64"), colour, extent });
}

test.beforeEach(async ({ page }) => {
  await mockDashboard(page); await journeyGeometry(page);
  await page.goto("/"); await openManualBusPlanner(page);
});

test("one numbered option groups both buses and the map draws both official legs", async ({ page, isMobile }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await plan(page);
  const option = page.getByRole("article", { name: "方案 1", exact: true });
  await expect(option.locator(".journey-leg")).toHaveCount(2);
  await expect(option).toContainText("上車"); await expect(option).toContainText("落車");
  await option.getByRole("button", { name: "地圖與步驟" }).click();
  await expect(page.locator(".workspace-map")).toBeVisible();
  if (isMobile) await expect(page.locator(".map-return")).toBeFocused();
  else await expect(page.locator(".journey-map-detail")).toBeFocused();
  for (const colour of JOURNEY_COLORS) await expect.poll(() => colourPixels(page, colour)).toBeGreaterThan(30);
  if (isMobile) await page.locator(".map-context button").click();
  await expect(page.locator(".journey-map-detail")).toContainText("同一站牌轉乘");
  await expect(page.locator(".journey-map-detail")).toContainText("測試終點站");
  for (const [index, plate] of ["AA0003", "AA0008"].entries()) {
    const leg = page.locator(".journey-step").filter({ has: page.locator("summary") }).nth(index);
    await leg.locator("summary").click();
    await expect(leg.getByText(new RegExp(plate))).toBeVisible();
  }
  await page.locator(".journey-map-detail").getByRole("button", { name: "查看本程到站資料" }).first().click();
  await expect(page.locator(".waiting-card")).toContainText("關閘總站");
  await page.getByRole("button", { name: "返回行程", exact: true }).click();
  await expect(page.locator(".journey-map-detail")).toBeVisible();
  expect(errors).toEqual([]);
});

test("an unavailable leg is labelled instead of drawing an invented bus connection", async ({ page, isMobile }) => {
  await journeyGeometry(page, true); await plan(page);
  await page.getByRole("button", { name: "地圖與步驟" }).click();
  await expect.poll(() => colourPixels(page, JOURNEY_COLORS[0])).toBeGreaterThan(30);
  // The dated alighting marker remains orange. No orange route may extend
  // beyond that marker's 16 CSS-pixel diameter (plus antialiasing).
  await expect.poll(() => colourPixels(page, JOURNEY_COLORS[1], true)).toBeLessThan(22);
  if (isMobile) await page.locator(".map-context button").click();
  await expect(page.locator(".journey-map-detail [role=status]")).toContainText("部分官方走線未能核實");
});

test("uses current Macau time again on each search, including across UTC midnight", async ({ page }) => {
  await page.route("**/api/v1/bus/network", (route) => {
    const stops = [
      { stationCode: "M1/9", stationName: "關閘總站", coordinates: [113.54918, 22.215502] },
      { stationCode: "M3", stationName: "測試終點站", coordinates: [113.53, 22.18] },
    ];
    return route.fulfill({ json: { data: {
      fetchedAt: "2026-11-10T10:00:00.000Z",
      coverage: { catalogRoutes: 2, loadedRoutes: 2, missingRoutes: [] },
      routes: [["N2", [[0, 360]]], ["3", [[360, 75]]]].map(([routeName, serviceWindows]) => ({
        routeName, routeCode: String(routeName).padStart(5, "0"), serviceWindows, stops,
        direction: 0, circular: false, company: { id: "orange", name: "澳巴", color: "orange" },
      })),
    }, meta: meta({ id: "bus-network", name: "Fixture timetable", url: "https://example.com/" }) } });
  });
  await page.reload();
  await openManualBusPlanner(page);
  await expect(page.locator('input[type="time"]')).toHaveCount(0);
  await expect(page.locator(".journey-planner:visible").getByText("現在出發", { exact: true })).toBeVisible();
  await page.clock.setFixedTime(new Date("2026-11-11T18:00:00Z"));
  await plan(page);
  await expect(page.locator(".journey-route-chain")).toHaveText(["N2"]);
  await page.clock.setFixedTime(new Date("2026-11-12T01:00:00Z"));
  await page.getByRole("button", { name: "尋找行程方案" }).click();
  await expect(page.locator(".journey-route-chain")).toHaveText(["3"]);
});

test("walking directions are a user-opened link with a disclosure, with no automatic Google request", async ({ page, context, isMobile }) => {
  await context.grantPermissions(["geolocation"]); await context.setGeolocation({ longitude: 113.5493, latitude: 22.2155 });
  const googleRequests: string[] = []; page.on("request", (request) => { if (request.url().includes("google.com/maps")) googleRequests.push(request.url()); });
  await page.locator(".journey-planner").getByRole("button", { name: "使用目前位置", exact: true }).click();
  await choose(page, "終點", "M3", "測試終點站 M3");
  await page.getByRole("button", { name: "尋找行程方案" }).click();
  await page.getByRole("button", { name: "地圖與步驟" }).click();
  if (isMobile) await page.locator(".map-context button").click();
  const walk = page.locator(".journey-map-detail").getByRole("link", { name: "開啟 Google 地圖步行導航" });
  await expect(walk).toHaveAttribute("href", /travelmode=walking/);
  await expect(page.locator(".journey-map-detail")).toContainText("將該段起終點交畀 Google 地圖");
  expect(googleRequests).toEqual([]);
});

test("dark navigation has no white inset shine and keyboard focus remains visible", async ({ page, isMobile }) => {
  await toggleTheme(page);
  const shadow = await page.locator(".workspace-nav-indicator").evaluate((element) => getComputedStyle(element).boxShadow);
  expect(shadow).not.toContain("255, 255, 255");
  await page.getByRole("tab", { name: "巴士", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  const outline = await page.getByRole("tab", { name: isMobile ? "AI 助手" : "輕軌", exact: true }).evaluate((element) => ({ style: getComputedStyle(element).outlineStyle, width: getComputedStyle(element).outlineWidth }));
  expect(outline.style).not.toBe("none"); expect(parseFloat(outline.width)).toBeGreaterThan(0);
});


test("vehicle status and expanded details stay stable across cache revalidation", async ({ page, isMobile }) => {
  let timing = { stale: false, ageMs: 0 };
  let polls = 0;
  await journeyGeometry(page, false, () => { polls++; return timing; });
  await plan(page);
  await page.getByRole("button", { name: "地圖與步驟" }).click();
  if (isMobile) await page.locator(".map-context button").click();
  const details = page.locator(".journey-map-detail details");
  await expect(details).toHaveCount(2);
  await details.first().locator("summary").click();
  await expect(details.first().getByText(/AA0003/)).toBeVisible();

  // Real source reads alternate between a fresh result and a 2–4 second old
  // snapshot while the server refreshes it. That must not remove the vehicles.
  for (const stale of [true, false, true]) {
    timing = { stale, ageMs: stale ? 3_500 : 0 };
    const before = polls;
    await expect.poll(() => polls, { timeout: 8_000 }).toBeGreaterThanOrEqual(before + 2);
    await expect(details).toHaveCount(2);
    await expect(details.first()).toHaveAttribute("open", "");
    await expect(details.first().getByText(/AA0003/)).toBeVisible();
    await expect(page.getByText("暫時未有最新車輛位置", { exact: true })).toHaveCount(0);
  }
  // A genuinely old snapshot still stops claiming current vehicle positions.
  timing = { stale: true, ageMs: 20_000 };
  await expect(details).toHaveCount(0, { timeout: 8_000 });
  await expect(page.getByText("暫時未有最新車輛位置", { exact: true })).toHaveCount(2);
  await expect(page.locator(".journey-map-detail")).toContainText("更新延遲");
});
