import { expect, test } from "@playwright/test";
import { mockDashboard, meta } from "./fixtures";

test("long publication links and controls fit beside the map", async ({ page, isMobile }) => {
  if (!isMobile) await page.setViewportSize({ width: 1024, height: 800 });
  await mockDashboard(page);
  await page.route("**/api/v1/traffic/news", route => route.fulfill({ json: {
    data: { items: [{ id: "news-layout", title: "交通公告排版測試", content: `官方詳情：https://www.dsat.gov.mo/${"a".repeat(180)}`, publishedAt: null, category: "general", url: "https://www.dsat.gov.mo/" }], feeds: [] },
    meta: meta({ id: "news", name: "政府交通新聞", url: "https://www.dsat.gov.mo/" }),
  } }));
  await page.goto("/");
  await page.getByRole("button", { name: "更多", exact: true }).click();
  await page.getByRole("button", { name: "交通公告", exact: true }).click();
  await expect(page.getByRole("heading", { name: "交通公告排版測試" })).toBeVisible();
  const sizes = await page.locator(".workspace-scroll").evaluate(e => ({ width: e.clientWidth, content: e.scrollWidth }));
  expect(sizes.content).toBeLessThanOrEqual(sizes.width + 1);
  const panel = await page.locator(".workspace-panel").boundingBox();
  const card = await page.locator(".published-list article").boundingBox();
  expect(card!.x + card!.width).toBeLessThanOrEqual(panel!.x + panel!.width);
  await page.getByRole("link", { name: "查看官方來源" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("link", { name: "查看官方來源" })).toBeInViewport();
});
