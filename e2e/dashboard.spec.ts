import { openSection, setLanguage, toggleTheme } from "./navigation";
import { expect, test, type Page } from "@playwright/test";
import { mockDashboard, meta } from "./fixtures";

async function openRoute(page: Page) {
  await page.getByRole("tab", { name: "巴士", exact: true }).click();
  await page.locator(".route-grid button").first().click();
  await expect(page.locator(".stop-row")).toHaveCount(1);
}
async function openMore(page: Page, label: string) { await openSection(page, label); }

async function showMap(page: Page, isMobile: boolean) {
  if (isMobile) await page.locator(".view-switch").getByRole("button", { name: "地圖", exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await mockDashboard(page);
  await page.goto("/");
});

test("one workspace renders the primary navigation and a usable mobile list", async ({ page, isMobile }) => {
  await expect(page.getByRole("tab")).toHaveCount(isMobile ? 4 : 5);
  await expect(page.locator("#workspace-content")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "去邊度？" })).toBeVisible();
  await expect(page.locator(".home-ai-help")).not.toHaveAttribute("open");
  await expect(page.locator(".workspace-map")).toBeVisible({ visible: !isMobile });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (isMobile) {
    await showMap(page, true);
    const back = page.locator(".map-return");
    await expect(back).toBeFocused();
    await back.click();
    await expect(page.locator('.view-switch button[aria-pressed="true"]')).toBeFocused();
    await expect(page.getByRole("heading", { name: "去邊度？" })).toBeVisible();
  }
});

test("the desktop tool tray fits beneath the panel at narrow and wide sizes", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop layout");
  const nav = page.getByRole("tablist");
  for (const width of [768, 1024, 1100, 1101, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(nav.getByRole("tab")).toHaveCount(5);
    const map = await page.locator(".workspace-map").boundingBox();
    const bar = await nav.boundingBox();
    const panel = await page.locator(".workspace-panel").boundingBox();
    const content = await page.locator(".workspace-scroll").boundingBox();
    const tools = await page.locator(".workspace-map-top").boundingBox();
    expect(map!.width).toBe(width);
    expect(bar!.x).toBeGreaterThanOrEqual(panel!.x);
    expect(bar!.x + bar!.width).toBeLessThan(panel!.x + panel!.width);
    expect(content!.y + content!.height).toBeLessThanOrEqual(bar!.y);
    expect(bar!.y + bar!.height).toBeLessThan(800);
    expect(panel!.x + panel!.width).toBeLessThan(tools!.x);
    const outside = await nav.evaluate((element) => {
      const bar = element.getBoundingClientRect();
      return [...element.querySelectorAll('[role="tab"]')]
        .filter((tab) => tab.getClientRects().length > 0)
        .filter((tab) => {
          const rect = tab.getBoundingClientRect();
          return rect.left < bar.left || rect.right > bar.right;
        })
        .map((tab) => tab.textContent);
    });
    expect(outside, `Tabs outside the navigation at ${width}px`).toEqual([]);
  }
});

test("primary navigation supports keyboard arrows and Home", async ({ page }) => {
  const home = page.getByRole("tab", { name: "出行", exact: true });
  await expect(page.getByRole("tablist")).toHaveAttribute("aria-orientation", "horizontal");
  await home.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "巴士", exact: true })).toBeFocused();
  await expect(page.getByRole("searchbox", { name: "搜尋路線號" })).toBeVisible();
  await page.keyboard.press("Home");
  await expect(home).toBeFocused();
  await expect(page.getByRole("heading", { name: "去邊度？" })).toBeVisible();
});

test("route selection opens stop-first details without a long catalog above them", async ({ page }) => {
  await openRoute(page);
  await expect(page.locator(".route-grid")).toHaveCount(0);
  await expect(page.locator(".vehicle-details")).not.toHaveAttribute("open");
  await page.locator("#workspace-content").evaluate((element) => {
    const scope = element as Element & {
      startViewTransition?: (update: () => void) => ViewTransition;
    };
    const start = scope.startViewTransition;
    if (start) {
      scope.startViewTransition = (update) => {
        scope.setAttribute("data-stop-snapshot", "");
        return start.call(scope, update);
      };
    }
  });
  await page.locator(".stop-row").click();
  await expect(page.locator(".waiting-card")).toBeInViewport();
  await expect(page.locator(".waiting-card")).toBeFocused();
  await expect(page.locator(".waiting-card")).toContainText("關閘總站");
  await expect(page.locator(".waiting-card")).toContainText("即將進站");
  await expect(page.locator(".stop-row")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#workspace-content[data-stop-snapshot]")).toHaveCount(0);
});

test("route search states its scope and gives an empty result", async ({ page }) => {
  await page.getByRole("tab", { name: "巴士", exact: true }).click();
  await page.getByRole("searchbox", { name: "搜尋路線號" }).fill("unknown");
  await expect(page.locator(".route-grid button")).toHaveCount(0);
  await expect(page.getByText("搵唔到符合嘅結果")).toBeVisible();
});

test("suspended stops never promise boarding even when the bus slice says due", async ({ page }) => {
  await page.route(/\/api\/v1\/bus\/routes\/[^/]+\/eta\?/, async (route) => {
    await route.fulfill({ json: { data: { routeName: "3", routeCode: "00003", direction: 0,
      stops: [{ sequence: 0, stationCode: "M1/9", stationName: "關閘總站", stopsAway: 0, coordinates: [113.54918, 22.215502], trafficStatus: "normal", trafficLevel: 1, suspended: true }],
      vehicles: [], routeSegments: [], diversion: { suspendedStops: [{ stationCode: "M1/9", stationName: "關閘總站" }] } },
      meta: meta({ id: "bus", name: "Test source", url: "https://example.com" }) } });
  });
  await openRoute(page);
  await expect(page.locator(".stop-row")).not.toContainText("即將進站");
  await page.locator(".stop-row").click();
  await expect(page.locator(".waiting-card")).toContainText("暫停");
  await expect(page.locator(".waiting-card")).not.toContainText("即將進站");
});

test("saved waiting stops survive a reload and reopen the official route", async ({ page }) => {
  await openRoute(page);
  await page.locator(".stop-row").click();
  await page.locator(".bus-workspace .save-button").click();
  await page.reload();
  await expect(page.locator(".saved-list button")).toContainText("關閘總站");
  await page.locator(".saved-list button").click();
  await expect(page.locator(".waiting-card")).toContainText("關閘總站");
});

test("bus polling stops when parking is open and resumes on return", async ({ page }) => {
  let requests = 0;
  page.on("request", (request) => { if (/\/bus\/routes\/[^/]+\/eta\?/.test(request.url())) requests += 1; });
  await openRoute(page);
  await expect.poll(() => requests, { timeout: 6_000 }).toBeGreaterThan(1);
  await openSection(page, "泊車");
  const before = requests;
  await page.waitForTimeout(4_500);
  expect(requests).toBe(before);
  await page.getByRole("tab", { name: "巴士", exact: true }).click();
  await expect.poll(() => requests).toBeGreaterThan(before);
});

test("parking switches vehicle type and displays its complete breakdown", async ({ page }) => {
  await openSection(page, "泊車");
  await expect(page.locator(".parking-row")).toContainText("13");
  await page.getByLabel("車種", { exact: true }).selectOption("motorcycle");
  await expect(page.locator(".parking-count strong")).toHaveText("48");
  await page.locator(".parking-row").click();
  await expect(page.locator(".parking-detail")).toBeInViewport();
  await expect(page.locator(".parking-breakdown")).toContainText("傷殘車位");
  await page.locator(".parking-detail .save-button").click();
  await page.getByRole("tab", { name: "出行", exact: true }).click();
  await expect(page.locator(".saved-list")).toContainText("下環街市");
});

test("switching sections exposes the search field at the top", async ({ page }) => {
  await openRoute(page);
  await page.locator(".vehicle-details").scrollIntoViewIfNeeded();
  await openSection(page, "泊車");
  await expect(page.getByRole("searchbox", { name: "搜尋停車場" })).toBeInViewport();
});

test("published news includes dates, availability and its incident-feed limitation", async ({ page }) => {
  await openMore(page, "交通公告");
  await expect(page.locator(".published-list")).toContainText("官方航班暫停通知");
  await expect(page.locator(".notice-explanation")).toContainText("並非完整即時事故流");
  await expect(page.locator(".data-warning")).toContainText("部分來源");
  await expect(page.locator(".published-list")).toContainText("發布");
});

test("unavailable weather is not rendered as no active warnings", async ({ page, isMobile }) => {
  await page.route("**/api/v1/weather", (route) => route.fulfill({ status: 503, json: { message: "Unavailable" } }));
  await page.reload();
  if (isMobile) await openSection(page, "路況摘要");
  await expect(page.getByText("未取得天氣資料，無法判斷有否警告。", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText("現時沒有生效警告")).toHaveCount(0);
});

test("source directory exposes failures and a retry", async ({ page }) => {
  await page.route("**/api/v1/borders", (route) => route.fulfill({ status: 503, json: { message: "Unavailable" } }));
  await page.reload();
  await openMore(page, "資料來源與狀態");
  await expect(page.locator(".source-directory .has-error")).toContainText("暫時無法取得資料");
  await expect(page.locator(".source-directory").getByRole("button", { name: "重新取得" }).first()).toBeVisible();
});

test("language and appearance remain usable", async ({ page }) => {
  await setLanguage(page, "EN");
  await expect(page.getByRole("tab", { name: "Travel", exact: true })).toBeVisible();
  const before = await page.locator(".resident-app").getAttribute("data-theme");
  await toggleTheme(page);
  await expect(page.locator(".resident-app")).toHaveAttribute("data-theme", before === "light" ? "dark" : "light");
  await page.reload();
  await expect(page.locator(".resident-app")).toHaveAttribute("data-theme", before === "light" ? "dark" : "light");
});

test("LRT station selection opens a usable map and keeps the schematic notice", async ({ page, isMobile }) => {
  await openMore(page, "輕軌");
  await page.locator(".lrt-lines button").first().click();
  await expect(page.locator(".lrt-station-button")).toHaveCount(2);
  await page.locator(".lrt-station-button").first().click();
  await expect(page.locator(".workspace-map")).toBeVisible();
  if (isMobile) {
    await page.getByRole("button", { name: "列表", exact: true }).click();
    await expect(page.locator(".workspace-panel")).toBeVisible();
  }
  await expect(page.locator(".workspace-panel")).toContainText("地圖列車為示意動畫");
});

test("focused bus routes load both 3D models at street zoom and can switch to 2D", async ({ page, isMobile }) => {
  const models: string[] = [];
  page.on("request", (request) => { if (request.url().includes(".glb")) models.push(request.url()); });
  await openRoute(page);
  expect(models).toHaveLength(0);
  await page.locator(".stop-row").click();
  await showMap(page, isMobile);
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.locator(".quick-3d")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => models.some((url) => url.endsWith("bus-stop.glb"))).toBe(true);
  await expect.poll(() => models.some((url) => url.endsWith("bus-tcm.glb"))).toBe(true);
  await page.getByRole("button", { name: "圖層", exact: true }).click();
  await page.locator(".workspace-layer-menu").getByRole("button", { name: "2D", exact: true }).click();
  await expect(page.locator(".quick-3d")).toHaveAttribute("aria-pressed", "false");
});

test("camera viewer opens and closes with the keyboard", async ({ page }) => {
  await openMore(page, "交通鏡頭");
  await page.locator(".camera-list button").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("AI answer stays available when navigating to another module", async ({ page }) => {
  await openMore(page, "AI 助手");
  await page.locator(".assistant-suggestions button").nth(1).click();
  await expect(page.locator(".assistant-answer")).toContainText("友誼大橋");
  await openSection(page, "泊車");
  await openMore(page, "AI 助手");
  await expect(page.locator(".assistant-answer")).toContainText("友誼大橋");
});

test("nearby uses browser location without sending coordinates to the public API", async ({ page, context, isMobile }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ longitude: 113.5345126, latitude: 22.1907894 });
  const outbound: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/v1/")) outbound.push(`${request.url()} ${request.postData() ?? ""}`); });
  if (isMobile) await openSection(page, "泊車");
  await page.getByRole("button", { name: "使用目前位置", exact: true }).click();
  await expect(page.locator(".nearby-row")).toContainText("直線距離");
  expect(outbound.every((request) => !request.includes("113.5345126") && !request.includes("22.1907894"))).toBe(true);
});

test("a real touch swipe scrolls the catalog without selecting a route", async ({ page, isMobile }) => {
  test.skip(!isMobile, "touch project");
  await page.route("**/api/v1/bus/routes", (route) => route.fulfill({ json: { data: Array.from({ length: 80 }, (_, i) => ({ routeName: String(i + 1), routeCode: String(i + 1).padStart(5, "0"), routeType: 0, company: { id: "orange", name: "澳巴", color: "orange" }, hasChange: false, live: true })), meta: meta({ id: "routes", name: "Test source", url: "https://example.com" }) } }));
  await page.reload();
  await page.getByRole("tab", { name: "巴士", exact: true }).tap();
  await expect(page.locator(".route-grid button")).toHaveCount(80);
  const box = await page.locator(".workspace-scroll").boundingBox();
  const x = box!.x + box!.width / 2;
  const start = box!.y + box!.height * .8;
  const end = box!.y + box!.height * .2;
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: start }] });
  for (let step = 1; step <= 10; step += 1) {
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: start + (end-start) * step / 10 }] });
    await page.waitForTimeout(16);
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => page.locator(".workspace-scroll").evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
  await expect(page.locator(".route-detail-head")).toHaveCount(0);
  await openSection(page, "泊車");
  await expect(page.getByRole("searchbox", { name: "搜尋停車場" })).toBeInViewport();
});

test("layout fits narrow phones, tablets and desktop widths", async ({ page }) => {
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const button of await page.locator(".workspace-nav button:visible").all()) {
      const box = await button.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.y + box!.height).toBeLessThanOrEqual(900);
    }
  }
});

test("long bus route numbers fit on one line inside each card", async ({ page }) => {
  const routeNames = ["103", "701X", "701XS", "AP1", "25AX", "25BS"];
  await page.route("**/api/v1/bus/routes", route => route.fulfill({ json: {
    data: routeNames.map((routeName, index) => ({
      routeName,
      routeCode: routeName.padStart(5, "0"),
      routeType: 0,
      company: index === 1 || index === 2
        ? { id: "orange", name: "澳巴", color: "orange" }
        : { id: "blue", name: "新福利", color: "blue" },
      hasChange: false,
      live: true,
    })),
    meta: meta({ id: "routes", name: "Test routes", url: "https://example.com" }),
  } }));
  await page.reload();
  await page.getByRole("tab", { name: "巴士", exact: true }).click();
  const labels = page.locator(".route-grid button strong");
  await expect(labels).toHaveText(routeNames);
  await page.evaluate(() => document.fonts.ready.then(() => true));

  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const outside = await labels.evaluateAll(elements => elements.flatMap(element => {
      const card = element.closest("button")!.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      const text = range.getBoundingClientRect();
      return range.getClientRects().length !== 1 || text.left < card.left + 4 || text.right > card.right - 4
        ? [element.textContent]
        : [];
    }));
    expect(outside, `Route numbers outside their card padding at ${width}px`).toEqual([]);
  }
});


test("a homepage AI question opens its answer with snapshot evidence", async ({ page }) => {
  let question = "";
  await page.route("**/api/v1/assistant", async (route) => { question = route.request().postDataJSON().question; await route.fallback(); });
  await page.locator("#home-question").fill("而家邊條橋比較暢順？");
  await page.locator('.home-ai form button[type="submit"]').click();
  await expect(page.getByRole("tab", { name: "AI 助手", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".assistant-answer")).toContainText("友誼大橋");
  await expect(page.locator(".assistant-context")).toContainText("官方道路狀態");
  await expect(page.locator(".assistant-note")).toBeVisible();
  expect(question).toBe("而家邊條橋比較暢順？");
});

test("AI provider failure shows an unavailable answer", async ({ page }) => {
  await page.route("**/api/v1/assistant", (route) => route.fulfill({ status: 503, json: { message: "Unavailable" } }));
  await page.locator("#home-question").fill("巴士有冇改道？");
  await page.locator('.home-ai form button[type="submit"]').click();
  await expect(page.locator(".assistant-entry .error-copy")).toBeVisible();
  await expect(page.locator(".assistant-answer")).toHaveCount(0);
});


test("hidden historical LRT faults are collapsed instead of shown as current service", async ({ page }) => {
  await page.route("**/api/v1/lrt/notices", (route) => route.fulfill({ json: { data: [{ id: "old", title: "2024 舊故障消息", content: "當時的服務安排", publishedAt: "2024-09-29T06:41:07.000Z", active: false }], meta: meta({ id: "lrt-notices", name: "Test source", url: "https://example.com" }) } }));
  await page.reload();
  await openSection(page, "輕軌");
  await expect(page.locator(".historical-notices")).not.toHaveAttribute("open");
  await expect(page.getByText("2024 舊故障消息", { exact: true })).not.toBeVisible();
  await page.locator(".historical-notices summary").click();
  await expect(page.getByText("2024 舊故障消息", { exact: true })).toBeVisible();
});


test("announcement lists check again within the one-minute polling window", async ({ page }) => {
  await page.clock.install();
  let requests = 0;
  page.on("request", (request) => { if (request.url().includes("/api/v1/traffic/news")) requests++; });
  await page.reload();
  await expect.poll(() => requests).toBeGreaterThan(0);
  await openSection(page, "交通公告");
  await expect(page.getByText("頁面開啟時約每分鐘檢查一次。", { exact: false })).toBeVisible();
  const initial = requests;
  await page.clock.fastForward(70_000);
  await expect.poll(() => requests).toBeGreaterThan(initial);
  const polled = requests;
  await page.getByRole("button", { name: "重新取得", exact: true }).click();
  await expect.poll(() => requests).toBeGreaterThan(polled);
});
