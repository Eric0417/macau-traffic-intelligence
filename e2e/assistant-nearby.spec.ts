import { expect, test } from "@playwright/test";
import { meta, mockDashboard } from "./fixtures";

const envelope = (data: unknown) => ({ data, meta: meta({ id: "assistant", name: "AI", url: "https://example.com" }) });
const answer = { kind: "nearby", answer: { answer: "附近停車場 · 直線距離約 120 m\n輕型車 12 · 電單車 未提供", model: "fixture", locale: "zh-Hant", snapshotAt: "2026-11-15T00:00:00Z", contextSummary: ["距離為直線估算"] } };
test.beforeEach(async ({ page }) => { await mockDashboard(page); });

test("nearby parking requests location and shows the grounded answer in the main panel", async ({ page, context, isMobile }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ longitude: 113.54, latitude: 22.19 });
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/v1/assistant/journeys", route => {
    const body = route.request().postDataJSON(); requests.push(body);
    return route.fulfill({ json: envelope(body.origin ? answer : { kind: "nearby-location" }) });
  });
  await page.goto("/");
  await page.locator("#home-question").fill("我附近有咩停車場？");
  await page.locator(".home-ai form").getByRole("button").click();
  const result = page.getByRole("region", { name: "附近交通資訊" });
  await expect(result).toBeVisible();
  await expect(result).toContainText("輕型車 12");
  expect(requests).toHaveLength(2);
  expect(requests[1].origin).toEqual([113.54, 22.19]);
  expect(requests[1].destinationId).toBeUndefined();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `docs/qa/assistant-routing/${isMobile ? "mobile" : "desktop"}-nearby-parking.png` });
});

test("denied nearby location recovers with a typed landmark", async ({ page }) => {
  await page.addInitScript(() => { navigator.geolocation.getCurrentPosition = (_ok, fail) => fail?.({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }); });
  let received: Record<string, unknown>;
  await page.route("**/api/v1/assistant/journeys", route => {
    received = route.request().postDataJSON();
    return route.fulfill({ json: envelope(received.originQuery ? answer : { kind: "nearby-location" }) });
  });
  await page.goto("/");
  await page.locator("#home-question").fill("附近有咩巴士站？");
  await page.locator(".home-ai form").getByRole("button").click();
  await page.getByRole("textbox", { name: "出發地點", exact: true }).fill("培正中學");
  await page.getByRole("button", { name: "由呢度出發", exact: true }).click();
  await expect(page.getByRole("region", { name: "附近交通資訊" })).toBeVisible();
  expect(received!.originQuery).toBe("培正中學");
});
