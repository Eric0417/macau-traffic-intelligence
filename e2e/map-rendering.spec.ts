import { expect, test, type Page } from "@playwright/test";
import { mockDashboard } from "./fixtures";

async function countCanvasColor(page: Page, rgb: [number, number, number]) {
  const shot = await page.locator(".maplibregl-canvas").screenshot();
  return page.evaluate(async ({ base64, rgb }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let matches = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (Math.abs(pixels[i]-rgb[0]) < 15 && Math.abs(pixels[i+1]-rgb[1]) < 15 && Math.abs(pixels[i+2]-rgb[2]) < 15) matches += 1;
    }
    return matches;
  }, { base64: shot.toString("base64"), rgb });
}

test.beforeEach(async ({ page, isMobile }) => {
  await mockDashboard(page);
  await page.goto("/");
  if (isMobile) await page.locator(".view-switch").getByRole("button", { name: "地圖", exact: true }).click();
});

test("traffic colours survive night mode and disappear when the road layer is disabled", async ({ page }) => {
  const congested: [number, number, number] = [215, 71, 52];
  await expect.poll(() => countCanvasColor(page, congested)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "配色", exact: true }).click();
  await expect.poll(() => countCanvasColor(page, [21, 35, 43])).toBeGreaterThan(1_000);
  await expect.poll(() => countCanvasColor(page, congested)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "圖層", exact: true }).click();
  await page.getByRole("checkbox", { name: "道路", exact: true }).uncheck();
  await expect.poll(() => countCanvasColor(page, congested)).toBe(0);
});

test("LRT focus hides road traffic and loads a platform only in 3D", async ({ page, isMobile }) => {
  await expect.poll(() => countCanvasColor(page, [215, 71, 52])).toBeGreaterThan(0);
  const models: string[] = [];
  page.on("request", (request) => { if (request.url().endsWith(".glb")) models.push(request.url()); });
  await page.getByRole("tab", { name: "輕軌", exact: true }).click();
  await page.locator(".lrt-lines button").first().click();
  await page.locator(".lrt-station-button").first().click();
  if (isMobile) await expect(page.locator(".workspace-map")).toBeVisible();
  await expect.poll(() => countCanvasColor(page, [215, 71, 52])).toBe(0);
  expect(models).toHaveLength(0);
  await page.getByRole("button", { name: "圖層", exact: true }).click();
  await page.locator(".workspace-layer-menu").getByRole("button", { name: "3D", exact: true }).click();
  await expect.poll(() => models.some((url) => url.endsWith("lrt-platform.glb"))).toBe(true);
  await expect.poll(() => models.some((url) => url.endsWith("lrt-car.glb"))).toBe(true);
});

test("a failed bus model retains the flat vehicle marker", async ({ page, isMobile }) => {
  await page.route("**/models/*.glb", (route) => route.abort());
  await page.getByRole("tab", { name: "巴士", exact: true }).click();
  await page.locator(".route-grid button").first().click();
  await page.locator(".stop-row").click();
  if (isMobile) await page.locator(".view-switch").getByRole("button", { name: "地圖", exact: true }).click();
  await page.getByRole("button", { name: "圖層", exact: true }).click();
  await page.locator(".workspace-layer-menu").getByRole("button", { name: "3D", exact: true }).click();
  await page.getByRole("button", { name: "圖層", exact: true }).click();
  await expect.poll(() => countCanvasColor(page, [226, 118, 27])).toBeGreaterThan(0);
});
