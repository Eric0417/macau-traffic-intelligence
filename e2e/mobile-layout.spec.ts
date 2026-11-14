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
    for (const name of ["出行", "巴士", "輕軌", "泊車", "AI 助手"]) {
      await page.getByRole("tab", { name, exact: true }).click();
      await expectContentToFit(page, ".panel-stack, .panel-stack > *, .assistant-form, .assistant-form textarea, .assistant-form button");
      const panel = await page.locator(".workspace-panel").boundingBox();
      const nav = await page.locator(".workspace-nav").boundingBox();
      expect(panel!.y + panel!.height).toBeLessThanOrEqual(nav!.y + 1);
      for (const button of await page.locator(".workspace-nav button").all()) {
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
    await page.locator(".appearance-toggle").click();
    await expect(page.locator(".resident-app")).toHaveAttribute("data-theme", "dark");
    await page.screenshot({ path: "docs/qa/mobile-layout/webkit-home-dark.png" });
  }
  await page.locator(".workspace-scroll").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const lastCard = await page.locator(".travel-home > :last-child").boundingBox();
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
  await page.locator("#home-question").fill("幫我安排傳統文化一日遊");
  await page.locator(".home-ai form").getByRole("button").click();
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
      await page.locator(".language-switch").getByRole("button", { name: language, exact: true }).click();
      await expectContentToFit(page, ".travel-home, .travel-home > *, .home-ai form, .home-ai-examples, .home-ai-examples button, .mode-tile, .home-ai form button");
      const button = await page.locator(".home-ai form button").boundingBox();
      expect(button!.width).toBeGreaterThanOrEqual(44);
      expect(button!.height).toBeGreaterThanOrEqual(44);
    }
  }
});
