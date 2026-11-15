import { openSection, setLanguage, toggleTheme } from "./navigation";
import { expect, test, type Page } from "@playwright/test";
import { meta, mockDashboard } from "./fixtures";

test.use({ reducedMotion: "reduce" });

async function expectContentToFit(page: Page, selector: string) {
  const overflow = await page.locator(selector).evaluateAll((elements) => {
    const scroll = document.querySelector(".workspace-scroll")!;
    const bounds = scroll.getBoundingClientRect();
    return elements.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || element.scrollWidth > element.clientWidth + 1)
        ? [{ element: element.className || element.tagName, left: rect.left, right: rect.right, width: element.clientWidth, scrollWidth: element.scrollWidth }]
        : [];
    });
  });
  expect(overflow).toEqual([]);
}

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(!isMobile, "Phone layout regression, including WebKit");
  await mockDashboard(page);
});

test("phone navigation and scrollable content stay inside the visible area", async ({ page }, testInfo) => {
  await page.goto("/");
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 680 });
    await openSection(page, "出行");
    await page.locator(".view-switch").getByRole("button", { name: "地圖", exact: true }).click();
    const map = await page.locator(".workspace-map").boundingBox();
    const nav = await page.locator(".workspace-nav").boundingBox();
    expect(map).toMatchObject({ x: 0, y: 0, width });
    expect(map!.height).toBeCloseTo(nav!.y, 0);
    await page.locator(".map-return").click();
    for (const name of ["出行", "巴士", "輕軌", "泊車", "AI 助手"]) {
      await openSection(page, name);
      await expectContentToFit(page, ".panel-stack, .panel-stack > *, .assistant-form, .assistant-form textarea, .assistant-form button");
      const panel = await page.locator(".workspace-panel").boundingBox();
      const nav = await page.locator(".workspace-nav").boundingBox();
      expect(panel!.y + panel!.height).toBeLessThanOrEqual(nav!.y + 1);
      for (const button of await page.locator(".workspace-nav button:visible").all()) {
        const box = await button.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 760 });
  await page.getByRole("tab", { name: "出行", exact: true }).click();
  if (testInfo.project.name === "mobile-webkit") {
    await page.screenshot({ path: "docs/qa/mobile-layout/webkit-home-light.png" });
    await toggleTheme(page);
    await expect(page.locator(".resident-app")).toHaveAttribute("data-theme", "dark");
    await page.screenshot({ path: "docs/qa/mobile-layout/webkit-home-dark.png" });
  }
  await page.locator(".workspace-scroll").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const lastCard = await page.locator(".travel-home > :visible").last().boundingBox();
  const nav = await page.locator(".workspace-nav").boundingBox();
  expect(lastCard!.y + lastCard!.height).toBeLessThanOrEqual(nav!.y);
});

test("day-trip date, time and text fields remain usable on phones", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/v1/assistant/journeys", route => route.fulfill({ json: {
    data: { kind: "trip-details", draft: { mode: "day", theme: "傳統文化", stops: [] }, missing: ["date", "startTime", "endTime", "originQuery", "endQuery", "preferences"] },
    meta: meta({ id: "assistant", name: "AI", url: "https://example.com" }),
  } }));
  // Include hydration in the WebKit check: locale date punctuation differs from Node.
  await page.goto("/");
  await expect(page.locator(".travel-temperature")).toBeVisible();
  await page.locator("#home-question").fill("幫我安排傳統文化一日遊");
  await page.locator('.home-ai form button[type="submit"]').click();
  await expect(page.getByRole("heading", { name: "先了解你嘅一日遊" })).toBeVisible();
  await page.getByLabel("出遊日期", { exact: true }).fill("2027-02-20");
  await page.getByLabel("開始時間", { exact: true }).fill("09:00");
  await page.getByLabel("結束時間", { exact: true }).fill("18:00");
  await page.getByLabel("出發地點", { exact: true }).fill("澳門培正中學");
  await page.getByLabel("最後去邊度", { exact: true }).fill("媽閣廟");
  await page.getByLabel("遊玩偏好", { exact: true }).fill("傳統文化，輕鬆步行");
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 680 });
    await expectContentToFit(page, ".assistant-planning, .trip-details, .trip-form, .trip-form label, .trip-form input, .trip-form textarea, .trip-form button");
    for (const field of await page.locator(".trip-form input, .trip-form textarea").all()) {
      expect(await field.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
    }
    await page.getByRole("button", { name: "安排一日遊方案", exact: true }).scrollIntoViewIfNeeded();
    const submit = await page.getByRole("button", { name: "安排一日遊方案", exact: true }).boundingBox();
    const nav = await page.locator(".workspace-nav").boundingBox();
    expect(submit!.y + submit!.height).toBeLessThanOrEqual(nav!.y + 1);
  }
  if (testInfo.project.name === "mobile-webkit") {
    await page.setViewportSize({ width: 390, height: 760 });
    await page.locator(".trip-form").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "docs/qa/mobile-layout/webkit-day-trip.png" });
  }
  expect(errors).toEqual([]);
});

test("home cards and submit controls fit narrow phones in every language", async ({ page }) => {
  await page.goto("/");
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 760 });
    for (const language of ["繁", "简", "EN"]) {
      await setLanguage(page, language);
      await expectContentToFit(page, ".travel-home, .travel-home > *, .home-ai form, .home-ai-examples, .home-ai-examples button, .mode-tile, .home-ai form button");
      const button = await page.locator('.home-ai form button[type="submit"]').boundingBox();
      expect(button!.width).toBeGreaterThanOrEqual(44);
      expect(button!.height).toBeGreaterThanOrEqual(44);
    }
  }
});

test("phone prioritizes AI and buses while secondary services and settings remain reachable", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.locator(".travel-temperature")).toBeVisible();
  await expect(page.getByRole("tab")).toHaveText(["出行", "巴士", "AI 助手", "更多"]);
  await expect(page.locator(".travel-shortcuts button:visible")).toHaveCount(1);
  await expect(page.locator(".workspace-header-actions")).toBeHidden();
  await page.locator("#home-question").fill("由媽閣去議事亭前地");
  await openSection(page, "輕軌");
  await expect(page.locator(".lrt-lines")).toBeVisible();
  await expect(page.getByRole("tab", { name: "更多", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "更多", exact: true }).click();
  await expect(page.locator(".more-grid")).toBeVisible();
  await expect(page.locator(".mobile-settings .appearance-toggle")).toBeHidden();
  await page.locator(".mobile-settings summary").click();
  await page.locator(".appearance-toggle:visible").click();
  await expect(page.locator(".resident-app")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".resident-app")).toHaveCSS("background-color", "rgb(28, 28, 28)");
  await expect(page.locator(".resident-app")).toHaveCSS("color", "rgb(245, 245, 245)");
  if (testInfo.project.name === "mobile-webkit") await page.screenshot({ path: "docs/qa/mobile-visual-polish/webkit-more-settings.png" });
  await page.locator(".language-switch:visible").getByRole("button", { name: "EN", exact: true }).click();
  await page.getByRole("tab", { name: "Travel", exact: true }).click();
  await expect(page.locator("#home-question")).toHaveValue("由媽閣去議事亭前地");
  const send = await page.locator('.home-ai form button[type="submit"]').boundingBox();
  expect(send!.height).toBeGreaterThanOrEqual(48);
  await expect(page.locator('.home-ai form button[type="submit"]')).toBeEnabled();
  await openSection(page, "Parking");
  await expect(page.locator(".parking-row").first()).toBeVisible();
});
