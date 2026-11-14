import { expect, test } from "@playwright/test";
import { mockDashboard, meta } from "./fixtures";
import { planBusJourneys, type BusNetwork } from "../src/lib/bus-journey";
import type { AssistantJourneyPlans } from "../src/lib/assistant-journey";

const origin: [number, number] = [113.54918, 22.215502];
const destination = { id: "arena", name: "澳門體育館", coordinates: [113.53, 22.18] as [number, number] };
const stopA = { stationCode: "M1/9", stationName: "關閘總站", coordinates: origin };
const stopB = { stationCode: "M2", stationName: "測試轉乘站", coordinates: [113.54, 22.19] as [number, number] };
const stopC = { stationCode: "M3", stationName: "測試終點站", coordinates: destination.coordinates };
const network: BusNetwork = { fetchedAt: "2026-11-10T10:00:00.000Z", coverage: { catalogRoutes: 2, loadedRoutes: 2, missingRoutes: [] }, routes: [
  { routeName: "3", routeCode: "00003", direction: 0, circular: false, company: { id: "orange", name: "澳巴", color: "orange" }, stops: [stopA, stopB] },
  { routeName: "8", routeCode: "00008", direction: 1, circular: false, company: { id: "blue", name: "新福利", color: "blue" }, stops: [stopB, stopC] },
] };
const plans: AssistantJourneyPlans = { kind: "plans", destination, origin: { id: "current", name: "目前位置", coordinates: origin }, generatedAt: "2026-11-13T06:00:00.000Z", networkFetchedAt: network.fetchedAt, walkingMappedAt: network.fetchedAt, model: "fixture-model", summary: "可以轉乘巴士，亦有步行方案。", warnings: ["班次時間未核實"], options: [
  { title: "乘搭 3 號轉 8 號", reason: "到轉乘站轉車。", journey: planBusJourneys(network, { stationCode: "M1/9" }, { stationCode: "M3" })[0] },
  { title: "沿步行路線前往", reason: "不用候車。", journey: { id: "walk", legs: [], totalStops: 0, transferMeters: 0, accessMeters: 4300, egressMeters: 0, walking: { direct: { from: origin, to: destination.coordinates, coordinates: [origin, destination.coordinates], meters: 4300 } } } },
] };
const envelope = (data: unknown) => ({ data, meta: meta({ id: "assistant", name: "AI", url: "https://example.com" }) });

test.beforeEach(async ({ page }) => { await mockDashboard(page); });

test("desktop guidance leaves the map visible and can collapse without losing its route", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop guide proportions");
  await page.route("**/api/v1/assistant/journeys", route => route.fulfill({ json: envelope(plans) }));
  await page.goto("/");
  await page.getByRole("tab", { name: "AI 助手", exact: true }).click();
  const guide = page.getByRole("region", { name: "出行指引" });
  expect((await guide.boundingBox())!.height).toBeLessThanOrEqual(90);
  await page.screenshot({ path: "docs/qa/map-guide-place-intent/desktop-idle.png" });
  await page.getByRole("textbox", { name: "輸入你的問題…", exact: true }).fill("去體育館");
  await page.getByRole("button", { name: "發問", exact: true }).click();
  await expect(guide).toContainText("同一站牌轉乘");
  expect((await guide.boundingBox())!.height / (await page.locator(".workspace-map").boundingBox())!.height).toBeLessThanOrEqual(.36);
  const expandedMapHeight = (await page.locator(".workspace-map > .absolute").boundingBox())!.height;
  await guide.getByRole("button", { name: "收合指引", exact: true }).click();
  expect((await guide.boundingBox())!.height).toBeLessThanOrEqual(52);
  expect((await page.locator(".workspace-map > .absolute").boundingBox())!.height).toBeGreaterThan(expandedMapHeight);
  await page.screenshot({ path: "docs/qa/map-guide-place-intent/desktop-collapsed.png" });
  await expect(guide.getByRole("button", { name: "展開指引", exact: true })).toHaveAttribute("aria-expanded", "false");
  await guide.getByRole("button", { name: "展開指引", exact: true }).press("Enter");
  await expect(guide.getByText("同一站牌轉乘", { exact: false })).toBeVisible();
});

test("a destination automatically gets location, renders model alternatives and opens each on the map", async ({ page, context, isMobile }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ longitude: origin[0], latitude: origin[1] });
  const requests: Record<string, unknown>[] = [];
  let secondLegCalls = 0;
  page.on("request", request => { if (request.url().includes("/bus/routes/00008/eta")) secondLegCalls++; });
  await page.route("**/api/v1/assistant/journeys", route => {
    const body = route.request().postDataJSON(); requests.push(body);
    return route.fulfill({ json: envelope(body.origin ? plans : { kind: "location", destination }) });
  });
  await page.goto("/");
  await page.locator("#home-question").fill("我想去澳門體育館");
  await page.locator(".home-ai form").getByRole("button").click();
  const guide = page.getByRole("region", { name: "出行指引" });
  await expect(guide).toContainText("同一站牌轉乘");
  expect(requests).toHaveLength(2);
  expect(requests[0].origin).toBeUndefined();
  expect(requests[1]).toMatchObject({ destinationId: "arena", origin, question: "我想去澳門體育館" });
  await guide.getByRole("button", { name: "查看本程到站資料", exact: true }).click();
  await expect(page.locator(".bus-route-header")).toBeVisible();
  const beforeReturn = secondLegCalls;
  await page.getByRole("tab", { name: "AI 助手", exact: true }).click();
  await expect.poll(() => secondLegCalls).toBeGreaterThan(beforeReturn);
  if (isMobile) await page.getByRole("button", { name: "地圖", exact: true }).click();
  await expect(guide).toContainText("同一站牌轉乘");
  if (isMobile) await page.locator(".map-return").click();
  await expect(page.locator(".assistant-option")).toHaveCount(2);
  await page.getByRole("button", { name: /沿步行路線前往/ }).click();
  await expect(guide).toContainText("全程步行");
  await expect(guide).not.toContainText("同一站牌轉乘");
  await page.screenshot({ path: `docs/qa/model-journeys/${isMobile ? "mobile" : "desktop"}-options.png` });
});

test("denied location keeps the destination and accepts a manual origin", async ({ page }) => {
  await page.addInitScript(() => { navigator.geolocation.getCurrentPosition = (_ok, fail) => fail?.({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }); });
  let receivedOrigin: string | undefined;
  await page.route("**/api/v1/assistant/journeys", route => {
    const body = route.request().postDataJSON(); receivedOrigin = body.originQuery;
    return route.fulfill({ json: envelope(body.originQuery ? plans : { kind: "location", destination }) });
  });
  await page.goto("/");
  await page.getByRole("tab", { name: "AI 助手", exact: true }).click();
  await page.getByRole("textbox", { name: "輸入你的問題…", exact: true }).fill("我想去澳門體育館");
  await page.getByRole("button", { name: "發問", exact: true }).click();
  await expect(page.getByText("未能取得位置。可以重試，或者輸入出發地點。")).toBeVisible();
  await page.getByRole("textbox", { name: "出發地點", exact: true }).fill("關閘總站");
  await page.getByRole("button", { name: "由呢度出發", exact: true }).click();
  await expect(page.getByRole("region", { name: "出行指引" })).toContainText("同一站牌轉乘");
  expect(receivedOrigin).toBe("關閘總站");
});

test("ambiguous destinations need a choice and unknown places do not invent plans", async ({ page }) => {
  await page.route("**/api/v1/assistant/journeys", route => route.fulfill({ json: envelope({ kind: "choose", field: "destination", choices: [destination, { ...destination, id: "other", name: "另一體育館" }] }) }));
  await page.goto("/");
  await page.locator("#home-question").fill("我想去體育館");
  await page.locator(".home-ai form").getByRole("button").click();
  await expect(page.getByText("你想去邊一個地點？")).toBeVisible();
  await expect(page.getByRole("button", { name: "澳門體育館", exact: true })).toBeVisible();
  await expect(page.locator(".assistant-option")).toHaveCount(0);
  await page.route("**/api/v1/assistant/journeys", route => route.fulfill({ json: envelope({ kind: "clarify", message: "未搵到呢個目的地，請提供完整地名或附近巴士站。" }) }));
  await page.getByRole("textbox", { name: "輸入你的問題…", exact: true }).fill("我想去不存在的地方");
  await page.getByRole("button", { name: "發問", exact: true }).click();
  await expect(page.getByText("未搵到呢個目的地，請提供完整地名或附近巴士站。")).toBeVisible();
  await expect(page.locator(".assistant-option")).toHaveCount(0);
});
