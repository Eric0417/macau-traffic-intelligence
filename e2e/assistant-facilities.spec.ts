import { expect, test, type Page } from "@playwright/test";
import type { AssistantJourneyPlans, AssistantJourneyResult } from "@/lib/assistant-journey";
import { meta, mockDashboard } from "./fixtures";
import { setLanguage } from "./navigation";

const origin = { id: "current", name: "目前位置", coordinates: [113.54777, 22.20233] as [number, number] };
const school = { ...origin, id: "pui-ching", name: "澳門培正中學" };
const hospital = { id: "kiang-wu", name: "鏡湖醫院", coordinates: [113.54268, 22.19917] as [number, number], distanceMeters: 631 };
const search = { category: "hospital", action: "directions" } as const;
const mappedAt = "2026-11-09T21:22:17Z";
const plans: AssistantJourneyPlans = {
  kind: "plans", origin, destination: hospital, summary: "沿步行地圖前往鏡湖醫院。", generatedAt: mappedAt,
  networkFetchedAt: mappedAt, walkingMappedAt: mappedAt, model: "fixture", warnings: [],
  facilityMatch: { search, distanceMeters: hospital.distanceMeters },
  options: [{
    title: "步行前往鏡湖醫院", reason: "沿已繪製嘅步行路徑。",
    journey: { id: "walk", legs: [], totalStops: 0, accessMeters: 780, egressMeters: 0, transferMeters: 0,
      walking: { direct: { from: origin.coordinates, to: hospital.coordinates, coordinates: [origin.coordinates, hospital.coordinates], meters: 780 } } },
  }],
};

async function stubAssistant(page: Page, handler: (body: Record<string, unknown>) => AssistantJourneyResult) {
  const requests: Array<Record<string, unknown>> = [];
  await page.route("**/api/v1/assistant/journeys", async route => {
    const body = route.request().postDataJSON();
    requests.push(body);
    await route.fulfill({ json: { data: handler(body), meta: meta({ id: "assistant", name: "Test assistant", url: "https://example.com" }) } });
  });
  return requests;
}
async function openHome(page: Page) {
  await page.goto("/");
  await expect(page.locator(".travel-temperature")).toBeVisible();
}

async function verifyOpenedJourney(page: Page, isMobile: boolean, language: "zh" | "en" = "zh") {
  const guide = page.getByRole("region", { name: language === "en" ? "Journey map & steps" : "行程地圖與步驟" });
  await expect(guide).toContainText("鏡湖醫院");
  await expect(guide).toContainText("780 m");
  if (isMobile) await guide.getByRole("button", { name: language === "en" ? "Back to options" : "返回方案" }).click();
}

test.beforeEach(async ({ page }) => { await mockDashboard(page); });

test("goes directly from a Cantonese nearest-hospital request to directions after location", async ({ page, context, isMobile, browserName }) => {
  test.skip(browserName === "webkit", "Playwright WebKit lacks simulated geolocation permission");
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ longitude: origin.coordinates[0], latitude: origin.coordinates[1] });
  const requests = await stubAssistant(page, body => body.origin ? plans : { kind: "facility-location", search });
  await openHome(page);
  await page.locator("#home-question").fill("我想要最近嘅醫院");
  await page.locator('.home-ai form button[type="submit"]').click();

  await verifyOpenedJourney(page, isMobile);
  const options = page.getByRole("region", { name: "AI 行程方案" });
  await expect(options).toContainText("鏡湖醫院");
  await expect(options).toContainText("直線距離約 631 m");
  await expect(options).toContainText("780 m");
  await expect(page.getByText("你想去邊一個地點？")).toHaveCount(0);
  expect(requests).toHaveLength(2);
  expect(requests[0].origin).toBeUndefined();
  expect(requests[1]).toMatchObject({ question: "我想要最近嘅醫院", origin: origin.coordinates, facilitySearch: search });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("asks only for an origin when location is denied, then keeps the facility request", async ({ page, isMobile }) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_ok, fail) => fail?.({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
  });
  const requests = await stubAssistant(page, body => body.originQuery ? { ...plans, origin: school } : { kind: "facility-location", search });
  await openHome(page);
  await page.getByRole("tab", { name: "AI 助手", exact: true }).click();
  await page.locator(".assistant-form textarea").fill("附近邊間醫院近啲，我想去嗰間");
  await page.locator('.assistant-form button[type="submit"]').click();
  await expect(page.getByText("未能取得位置。可以重試，或者輸入出發地點。")).toBeVisible();
  await page.getByRole("textbox", { name: "出發地點", exact: true }).fill("培正中學");
  await page.getByRole("button", { name: "由呢度出發", exact: true }).click();
  await verifyOpenedJourney(page, isMobile);
  await expect(page.getByRole("region", { name: "AI 行程方案" })).toContainText("澳門培正中學 → 鏡湖醫院");
  expect(requests[1]).toMatchObject({ originQuery: "培正中學", facilitySearch: search });
  expect(requests[1].destinationId).toBeUndefined();
});

test("lists English-language results by a named landmark and opens the chosen route without asking for device location", async ({ page, isMobile }) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = () => { throw new Error("unexpected_geolocation"); };
  });
  const requests = await stubAssistant(page, body => body.destinationId ? { ...plans, origin: school } : {
    kind: "facilities", origin: school, search: { category: "hospital", action: "list" }, mappedAt,
    matches: [hospital, { ...hospital, id: "other-hospital", name: "仁伯爵綜合醫院", distanceMeters: 949 }],
  });
  await openHome(page);
  await setLanguage(page, "EN");
  await page.locator("#home-question").fill("Any hospitals around Pui Ching?");
  await page.locator('.home-ai form button[type="submit"]').click();
  const results = page.getByRole("region", { name: "Hospitals nearby" });
  await expect(results.locator("li")).toHaveCount(2);
  await expect(results.getByRole("button", { name: "Directions to 鏡湖醫院" })).toBeInViewport({ ratio: 1 });
  await expect(results.locator("li").first()).toContainText("About 631 m straight-line distance");
  await results.getByRole("button", { name: "Directions to 鏡湖醫院" }).click();
  await verifyOpenedJourney(page, isMobile, "en");
  await expect(page.getByRole("region", { name: "AI journey options" })).toContainText("澳門培正中學 → 鏡湖醫院");
  expect(requests).toHaveLength(2);
  expect(requests[0]).toMatchObject({ locale: "en" });
  expect(requests[1]).toMatchObject({ destinationId: hospital.id, originId: school.id });
  expect(requests[1].origin).toBeUndefined();
});

test("distinguishes unverified hours from a pharmacy that is confirmed open", async ({ page }) => {
  const requests = await stubAssistant(page, () => ({
    kind: "facilities", origin: school, search: { category: "pharmacy", action: "directions", verify: "hours" }, mappedAt,
    matches: [{ ...hospital, name: "附近藥房" }],
  }));
  await openHome(page);
  await page.locator("#home-question").fill("培正附近仲有冇藥房開緊");
  await page.locator('.home-ai form button[type="submit"]').click();
  const results = page.getByRole("region", { name: "附近藥房" });
  await expect(results).toContainText("未能核實而家邊間營業");
  await expect(results).toContainText("查看路線");
  await expect(page.getByRole("region", { name: "AI 行程方案" })).toHaveCount(0);
  expect(requests).toHaveLength(1);
});

test("an ambulance request shows the Macau emergency phone link without asking for an origin", async ({ page }) => {
  await stubAssistant(page, () => ({ kind: "emergency" }));
  await openHome(page);
  await page.locator("#home-question").fill("幫我叫白車");
  await page.locator('.home-ai form button[type="submit"]').click();
  await expect(page.getByRole("link", { name: "致電 999" })).toHaveAttribute("href", "tel:999");
  await expect(page.getByRole("textbox", { name: "出發地點" })).toHaveCount(0);
});
