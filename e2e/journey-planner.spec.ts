import { expect, test, type Page } from "@playwright/test";
import { meta, mockDashboard } from "./fixtures";

async function chooseStop(page: Page, label: string, query: string, name: string) {
  await page.getByRole("searchbox", { name: label, exact: true }).fill(query);
  await page.getByRole("list", { name: label, exact: true }).getByRole("button", { name }).click();
}

test.beforeEach(async ({ page }) => {
  await mockDashboard(page);
  await page.goto("/");
  await page.getByRole("tab", { name: "巴士", exact: true }).click();
});

test("a directed journey opens its live boarding stop and survives returning to the planner", async ({ page }) => {
  await chooseStop(page, "起點", "M1/9", "關閘總站 M1/9");
  await chooseStop(page, "終點", "M2", "測試轉乘站 M2");
  await page.getByRole("button", { name: "尋找行程方案" }).click();
  await expect(page.locator(".journey-option")).toContainText("直達");
  await expect(page.locator(".journey-option")).toContainText("1 站");
  await page.getByRole("button", { name: "查看到站與停站狀態" }).click();
  await expect(page.locator(".waiting-card")).toContainText("關閘總站");
  await page.locator(".bus-route-header .text-action").first().click();
  await expect(page.getByRole("searchbox", { name: "終點", exact: true })).toHaveValue("測試轉乘站");
  await expect(page.locator(".journey-option")).toContainText("直達");
});

test("location-based one-transfer search keeps coordinates off API requests", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ longitude: 113.5492, latitude: 22.2155 });
  const requests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/")) requests.push(`${request.url()} ${request.postData() ?? ""}`); });
  await page.getByRole("button", { name: "使用目前位置", exact: true }).click();
  await expect(page.getByRole("button", { name: "尋找行程方案" })).toBeEnabled();
  await chooseStop(page, "終點", "M3", "測試終點站 M3");
  await page.getByRole("button", { name: "尋找行程方案" }).click();
  await expect(page.locator(".journey-option")).toContainText("轉乘一次");
  await expect(page.locator(".journey-option .journey-leg")).toHaveCount(2);
  await expect(page.locator(".journey-option")).toContainText("到上車站直線距離");
  expect(requests.join("\n")).not.toMatch(/113\.5492|22\.2155|latitude|longitude/);
});

test("reverse travel does not fabricate an unavailable journey and unknown places require a selected stop", async ({ page }) => {
  await chooseStop(page, "起點", "M2", "測試轉乘站 M2");
  await chooseStop(page, "終點", "M1/9", "關閘總站 M1/9");
  await page.getByRole("button", { name: "尋找行程方案" }).click();
  await expect(page.locator(".journey-results")).toContainText("未找到符合條件");
  await page.getByRole("searchbox", { name: "終點", exact: true }).fill("未核實地址");
  await page.getByRole("button", { name: "尋找行程方案" }).click();
  await expect(page.locator(".journey-planner [role=status]")).toContainText("請從建議清單選擇");
  await expect(page.locator(".journey-results")).toHaveCount(0);
});

test("LRT exposes official station timetable links with a scheduled-data label", async ({ page }) => {
  await page.getByRole("tab", { name: "輕軌", exact: true }).click();
  await expect(page.locator(".lrt-service")).toContainText("未接通即時到站資料");
  await page.locator(".lrt-service summary").first().click();
  await expect(page.locator(".lrt-timetables a").first()).toHaveAttribute("href", "https://www.mlm.com.mo/images/stations/TimeTable/2026_09/TT_BAR_2026_09_V2.jpg");
  await expect(page.locator(".lrt-service")).toContainText("2026年9月");
});

test("newer navigation cancels a boarding selection while arrivals are pending", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/v1/bus/routes/00003/eta**", async (route) => {
    await gate;
    await route.fulfill({ json: { data: {
      routeName: "3", routeCode: "00003", direction: 0,
      stops: [{ sequence: 0, stationCode: "M1/9", stationName: "關閘總站", stopsAway: 0, coordinates: [113.54918, 22.215502], trafficStatus: "normal", trafficLevel: 1, suspended: false }],
      vehicles: [], routeSegments: [], diversion: { suspendedStops: [] },
    }, meta: meta({ id: "bus-eta", name: "Test arrivals", url: "https://example.com/" }) } });
  });
  await chooseStop(page, "起點", "M1/9", "關閘總站 M1/9");
  await chooseStop(page, "終點", "M2", "測試轉乘站 M2");
  await page.getByRole("button", { name: "尋找行程方案" }).click();
  await page.getByRole("button", { name: "查看到站與停站狀態" }).click();
  await expect(page.locator(".bus-route-header")).toBeVisible();
  await page.getByRole("tab", { name: "出行", exact: true }).click();
  await page.getByRole("tab", { name: "巴士", exact: true }).click();
  release();
  await expect(page.locator(".stop-row")).toBeVisible();
  await expect(page.locator(".waiting-card")).toHaveCount(0);
});

test("a changed route with repeated stop codes leaves boarding selection to the rider", async ({ page }) => {
  await page.route("**/api/v1/bus/routes/00003/eta**", async (route) => {
    await route.fulfill({ json: { data: {
      routeName: "3", routeCode: "00003", direction: 0,
      stops: [0, 5].map((sequence) => ({ sequence, stationCode: "M1/9", stationName: "關閘總站", stopsAway: sequence, coordinates: [113.54918, 22.215502], trafficStatus: "normal", trafficLevel: 1, suspended: false })),
      vehicles: [], routeSegments: [], diversion: { suspendedStops: [] },
    }, meta: meta({ id: "bus-eta", name: "Test arrivals", url: "https://example.com/" }) } });
  });
  await chooseStop(page, "起點", "M1/9", "關閘總站 M1/9");
  await chooseStop(page, "終點", "M2", "測試轉乘站 M2");
  await page.getByRole("button", { name: "尋找行程方案" }).click();
  await page.getByRole("button", { name: "查看到站與停站狀態" }).click();
  await expect(page.locator(".stop-row")).toHaveCount(2);
  await expect(page.locator(".waiting-card")).toHaveCount(0);
  await page.locator(".stop-row").last().click();
  await expect(page.locator(".waiting-card")).toContainText("5");
});
