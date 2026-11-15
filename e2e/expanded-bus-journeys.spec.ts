import { expect, test } from "@playwright/test";
import { mockDashboard, meta } from "./fixtures";
import { planBusJourneys, type BusNetwork } from "../src/lib/bus-journey";

test("opens all four bus legs independently and keeps the taxi suggestion separate", async ({ page, isMobile }) => {
  await mockDashboard(page);
  const stops = Array.from({ length: 5 }, (_, i) => ({ stationCode: `T${i}`, stationName: `測試站${i}`, coordinates: [113.54 + i * .005, 22.2 - i * .012] as [number, number] }));
  const network: BusNetwork = { fetchedAt: "2026-11-10T00:00:00Z", coverage: { catalogRoutes: 4, loadedRoutes: 4, missingRoutes: [] }, routes: Array.from({ length: 4 }, (_, i) => ({
    routeCode: `0000${i + 3}`, routeName: String(i + 3), direction: 0, circular: false,
    company: { id: "orange", name: "澳巴", color: "orange" }, stops: stops.slice(i, i + 2),
  })) };
  const journey = planBusJourneys(network, { stationCode: "T0" }, { stationCode: "T4" })[0];
  const seen = new Set<string>();
  const envelope = (data: unknown) => ({ data, meta: meta({ id: "fixture", name: "Fixture", url: "https://example.com" }) });
  await page.route("**/api/v1/bus/routes/*/eta**", route => {
    const bus = network.routes.find(r => route.request().url().includes(r.routeCode))!;
    seen.add(bus.routeCode);
    return route.fulfill({ json: envelope({ routeCode: bus.routeCode, routeName: bus.routeName, direction: 0,
      stops: bus.stops.map((s, sequence) => ({ ...s, sequence, suspended: false, trafficStatus: "normal", trafficLevel: 1, stopsAway: 0 })),
      vehicles: [{ id: bus.routeCode, plate: `BUS${bus.routeName}`, stationCode: bus.stops[1].stationCode, stationName: bus.stops[1].stationName, coordinates: bus.stops[0].coordinates, positionSource: "feed" }],
      routeSegments: [{ fromStationCode: bus.stops[0].stationCode, toStationCode: bus.stops[1].stationCode, coordinates: bus.stops.map(s => s.coordinates), trafficStatus: "normal", trafficLevel: 1 }],
      diversion: { suspendedStops: [] },
    }) });
  });
  await page.route("**/api/v1/assistant/journeys", route => route.fulfill({ json: envelope({ kind: "plans",
    origin: { id: "start", name: "出發地", coordinates: stops[0].coordinates }, destination: { id: "end", name: "目的地", coordinates: stops[4].coordinates },
    generatedAt: network.fetchedAt, networkFetchedAt: network.fetchedAt, walkingMappedAt: network.fetchedAt,
    model: "fixture", summary: "乘搭四程巴士到目的地。", warnings: [], taxiAlternative: "可乘的士直達目的地；未有車費、車程或即時車輛資料。",
    options: [{ title: "三次轉乘", reason: "按站序接駁", journey }],
  }) }));
  await page.goto("/");
  await page.getByRole("tab", { name: "AI 助手", exact: true }).click();
  await page.getByRole("textbox", { name: "輸入你的問題…", exact: true }).fill("去目的地");
  await page.getByRole("button", { name: "發問", exact: true }).click();
  await expect.poll(() => [...seen].sort()).toEqual(network.routes.map(r => r.routeCode));
  const guide = page.getByRole("region", { name: "出行指引" });
  await expect(guide).toContainText("4 程巴士");
  await expect(guide).not.toContainText("部分官方走線未能核實");
  await expect(guide.locator(".journey-route-number")).toHaveText(["3", "4", "5", "6"]);
  for (const [i, bus] of network.routes.entries()) {
    const step = guide.locator(".journey-step").nth(i);
    await step.locator("summary").click();
    await expect(step).toContainText(`BUS${bus.routeName}`);
    await expect(step).not.toContainText(`BUS${i === 0 ? "4" : "3"}`);
  }
  if (isMobile) await page.locator(".map-return").click();
  await expect(page.getByRole("heading", { name: "的士備選" })).toBeVisible();
  await expect(page.locator(".assistant-option")).toHaveCount(1);
});
