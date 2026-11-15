import { expect, test } from "@playwright/test";
import { meta, mockDashboard } from "./fixtures";
import type { ItineraryOption, ItineraryPlans, TripDraft } from "../src/lib/itinerary";

const points = [
  { id: "school", name: "澳門培正中學", coordinates: [113.548, 22.201] as [number, number], stayMinutes: 0 },
  { id: "stadium", name: "澳門運動場", coordinates: [113.553, 22.155] as [number, number], stayMinutes: 60 },
  { id: "temple", name: "媽閣廟", coordinates: [113.531, 22.186] as [number, number], stayMinutes: 30 },
];
function option(id: string, title: string, stops = points): ItineraryOption {
  return { id, title, reason: "按地點次序連接交通。", stops, sections: stops.slice(0, -1).map((from, i) => ({ from, to: stops[i + 1], warnings: ["步行資料有指定日期。"], journeys: [{ id: `walk-${i}`, legs: [], totalStops: 0, accessMeters: 900, egressMeters: 0, transferMeters: 0, walking: { direct: { from: from.coordinates, to: stops[i + 1].coordinates, coordinates: [from.coordinates, stops[i + 1].coordinates], meters: 900 } } }] })) };
}
const draft: TripDraft = { mode: "ordered", originQuery: "澳門培正中學", originId: "school", stops: [{ query: "澳門運動場", placeId: "stadium", stayMinutes: 60 }, { query: "媽閣廟", placeId: "temple", stayMinutes: 30 }] };
const plans = (trip = draft): ItineraryPlans => ({ kind: "itineraries", draft: trip, generatedAt: new Date().toISOString(), networkFetchedAt: "2026-11-10T00:00:00Z", walkingMappedAt: "2026-11-09T00:00:00Z", warnings: ["交通耗時未有可靠數據。"], options: [option("ordered", "按指定次序")] });
const envelope = (data: unknown) => ({ data, meta: meta({ id: "assistant", name: "AI", url: "https://example.com" }) });
test.beforeEach(async ({ page }) => { await mockDashboard(page); });

test("shows a complete bus recommendation with alternatives collapsed", async ({ page, isMobile }) => {
  const result = plans();
  result.options[0].reason = "先搭56號去石排灣，再乘接駁巴士到下一站。";
  const section = result.options[0].sections[0];
  section.journeys.unshift({ id: "bus56", legs: [{ routeName: "56", routeCode: "00056", direction: 0, terminalName: "蝴蝶谷大馬路總站", circular: false,
    from: { stationCode: "M61", stationName: "二龍喉公園", coordinates: section.from.coordinates }, to: { stationCode: "C688/1", stationName: "和諧廣場/業興大廈", coordinates: section.to.coordinates }, fromSequence: 0, toSequence: 12, stopCount: 12 }],
    accessMeters: 160, egressMeters: 250, transferMeters: 0, totalStops: 12 });
  await page.route("**/api/v1/assistant/journeys", route => route.fulfill({ json: envelope(result) }));
  await page.goto("/");
  await page.locator("#home-question").fill("幫我安排整套巴士路線");
  await page.locator(".home-ai form").getByRole("button").click();
  const itinerary = page.getByRole("region", { name: "完整行程" });
  await expect(itinerary.getByText(result.options[0].reason, { exact: true })).toBeVisible();
  await expect(itinerary.locator(".trip-connection-steps")).toContainText("二龍喉公園");
  await expect(itinerary.locator(".trip-connection-steps")).toContainText("和諧廣場/業興大廈");
  const alternatives = itinerary.locator(".trip-other-connections");
  await expect(alternatives).not.toHaveAttribute("open", "");
  await expect(alternatives.locator(".trip-connection-option")).not.toBeVisible();
  await itinerary.locator(".trip-connection-steps").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `docs/qa/assistant-routing/${isMobile ? "mobile" : "desktop"}-complete-plan.png` });
  await alternatives.locator("summary").click();
  await expect(alternatives.locator(".trip-connection-option")).toBeVisible();
});

test("ordered destinations keep separate connections, open the second map and remain editable", async ({ page, isMobile }) => {
  const requests: Array<{ trip?: TripDraft }> = [];
  await page.route("**/api/v1/assistant/journeys", route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: envelope(plans()) });
  });
  await page.goto("/");
  await page.locator("#home-question").fill("由培正去澳門運動場，再去媽閣");
  await page.locator(".home-ai form").getByRole("button").click();
  const itinerary = page.getByRole("region", { name: "完整行程" });
  await expect(itinerary.locator(".itinerary-stop-heading h3")).toHaveText(points.map(p => p.name));
  await expect(itinerary.locator(".itinerary-connection")).toHaveCount(2);
  await itinerary.locator(".trip-connection-option").nth(1).click();
  const guide = page.getByRole("region", { name: "出行指引" });
  await expect(guide).toContainText("2/2 · 澳門運動場 → 媽閣廟");
  await expect(guide).toContainText("唔代表稍後接駁時嘅班次");
  await guide.getByRole("button", { name: "返回方案", exact: true }).click();
  await expect(itinerary).toBeVisible();
  await itinerary.getByRole("button", { name: "修改地點及停留時間", exact: true }).click();
  await itinerary.locator(".trip-edit-stop").first().getByRole("button", { name: "移除", exact: true }).click();
  await itinerary.getByRole("button", { name: "更新行程", exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].trip?.stops.map(s => s.placeId)).toEqual(["temple"]);
  await expect(itinerary).toBeVisible();
  await itinerary.locator(".itinerary-stop-heading").first().scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `docs/qa/itineraries/${isMobile ? "mobile" : "desktop"}-ordered.png` });
});

test("day trip asks for details, compares complete alternatives and keeps the selected plan for follow-ups", async ({ page, isMobile }) => {
  const requests: Array<{ trip?: TripDraft; previousTrip?: TripDraft }> = [];
  await page.route("**/api/v1/assistant/journeys", route => {
    const body = route.request().postDataJSON(); requests.push(body);
    if (!body.trip && !body.previousTrip) return route.fulfill({ json: envelope({ kind: "trip-details", draft: { mode: "day", theme: "傳統文化", stops: [] }, missing: ["date", "startTime", "endTime", "originQuery", "endQuery", "preferences"] }) });
    const result = plans(body.trip ?? body.previousTrip);
    result.options = [option("day-0", "廟宇與舊城"), option("day-1", "文化慢遊", [points[0], points[2], points[0]])];
    result.options = result.options.map(o => ({ ...o, stops: o.stops.map((s, i) => ({ ...s, visit: i > 0 && i < o.stops.length - 1 })) }));
    return route.fulfill({ json: envelope(result) });
  });
  await page.goto("/");
  await page.locator("#home-question").fill("幫我安排傳統文化一日遊");
  await page.locator(".home-ai form").getByRole("button").click();
  await expect(page.getByRole("heading", { name: "先了解你嘅一日遊" })).toBeVisible();
  await expect(page.locator(".itinerary-results")).toHaveCount(0);
  const futureDate = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);
  await page.getByLabel("出遊日期", { exact: true }).fill(futureDate);
  await page.getByLabel("開始時間", { exact: true }).fill("09:00");
  await page.getByLabel("結束時間", { exact: true }).fill("18:00");
  await page.getByLabel("出發地點", { exact: true }).fill("澳門培正中學");
  await page.getByLabel("最後去邊度", { exact: true }).fill("澳門培正中學");
  await page.getByLabel("遊玩偏好", { exact: true }).fill("傳統廟宇，節奏輕鬆");
  await page.getByRole("button", { name: "安排一日遊方案", exact: true }).click();
  await expect(page.locator(".trip-alternatives .assistant-option")).toHaveCount(2);
  expect(requests[1].trip).toMatchObject({ date: futureDate, startTime: "09:00", endTime: "18:00", preferences: "傳統廟宇，節奏輕鬆" });
  await page.getByRole("textbox", { name: "輸入你的問題…", exact: true }).fill("第一站停留兩個鐘");
  await page.getByRole("button", { name: "發問", exact: true }).click();
  await expect.poll(() => requests.length).toBe(3);
  expect(requests[2].previousTrip).toMatchObject({ mode: "day", fixedStops: true });
  expect(requests[2].previousTrip?.stops.map(s => s.placeId)).toEqual(["stadium"]);
  await page.getByRole("button", { name: /2. 文化慢遊/ }).click();
  await expect(page.locator(".itinerary-stop-heading h3")).toHaveText(["澳門培正中學", "媽閣廟", "澳門培正中學"]);
  await page.screenshot({ path: `docs/qa/itineraries/${isMobile ? "mobile" : "desktop"}-day-trip.png` });
  await page.getByRole("textbox", { name: "輸入你的問題…", exact: true }).fill("第一站想停留耐啲");
  await page.getByRole("button", { name: "發問", exact: true }).click();
  await expect.poll(() => requests.length).toBe(4);
  expect(requests[3].previousTrip).toMatchObject({ mode: "day", fixedStops: true, date: futureDate });
  expect(requests[3].previousTrip?.stops.map(s => s.placeId)).toEqual(["temple"]);
});

test("denied geolocation retains all ordered destinations for manual recovery", async ({ page }) => {
  await page.addInitScript(() => { navigator.geolocation.getCurrentPosition = (_ok, fail) => fail?.({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }); });
  let recovered: TripDraft | undefined;
  await page.route("**/api/v1/assistant/journeys", route => {
    const body = route.request().postDataJSON();
    if (body.trip?.originQuery) { recovered = body.trip; return route.fulfill({ json: envelope(plans()) }); }
    return route.fulfill({ json: envelope({ kind: "trip-location", draft: { ...draft, originQuery: undefined, originId: undefined } }) });
  });
  await page.goto("/");
  await page.locator("#home-question").fill("去澳門運動場，再去媽閣");
  await page.locator(".home-ai form").getByRole("button").click();
  await expect(page.getByText("未能取得位置。可以重試，或者輸入出發地點。")).toBeVisible();
  await page.getByLabel("出發地點", { exact: true }).fill("澳門培正中學");
  await page.getByRole("button", { name: "由呢度出發", exact: true }).click();
  await expect(page.getByRole("region", { name: "完整行程" })).toBeVisible();
  expect(recovered?.stops).toHaveLength(2);
  expect(recovered?.originQuery).toBe("澳門培正中學");
});
