import { openSection, toggleTheme } from "./navigation";
import { expect, test, type Page } from "@playwright/test";
import { mockDashboard } from "./fixtures";
import { MACAU_CENTER } from "../src/lib/config";

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
  if (isMobile) {
    await openSection(page, "路況摘要");
    await page.locator(".view-switch").getByRole("button", { name: "地圖", exact: true }).click();
  }
});

test("traffic colours survive night mode and disappear when the road layer is disabled", async ({ page }) => {
  const congested: [number, number, number] = [215, 71, 52];
  await expect.poll(() => countCanvasColor(page, [236, 238, 240])).toBeGreaterThan(1_000);
  await expect.poll(() => countCanvasColor(page, congested)).toBeGreaterThan(0);
  await toggleTheme(page);
  await expect.poll(() => countCanvasColor(page, [34, 35, 37])).toBeGreaterThan(1_000);
  await expect.poll(() => countCanvasColor(page, congested)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "圖層", exact: true }).click();
  await page.getByRole("checkbox", { name: "道路", exact: true }).uncheck();
  await expect.poll(() => countCanvasColor(page, congested)).toBe(0);
});

test("LRT focus hides road traffic and loads a platform only in 3D", async ({ page, isMobile }) => {
  await expect.poll(() => countCanvasColor(page, [215, 71, 52])).toBeGreaterThan(0);
  const models: string[] = [];
  page.on("request", (request) => { if (request.url().endsWith(".glb")) models.push(request.url()); });
  await openSection(page, "輕軌");
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
  const failedBus = page.waitForEvent("requestfailed", (request) => request.url().endsWith("/bus-tcm.glb"));
  await page.getByRole("tab", { name: "巴士", exact: true }).click();
  await page.locator(".route-grid button").first().click();
  await page.locator(".stop-row").click();
  if (isMobile) await page.locator(".view-switch").getByRole("button", { name: "地圖", exact: true }).click();
  await expect(page.locator(".quick-3d")).toHaveAttribute("aria-pressed", "true");
  await failedBus;
  await expect.poll(() => countCanvasColor(page, [226, 118, 27])).toBeGreaterThan(0);
});

test("focused routes hide the base symbols in 3D and 2D and restore them on exit", async ({ page, isMobile }) => {
  const symbolColor: [number, number, number] = [157, 36, 218];
  const sprite = await page.evaluate((rgb) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 24;
    const context = canvas.getContext("2d")!;
    context.fillStyle = `rgb(${rgb.join(",")})`;
    context.fillRect(0, 0, 24, 24);
    return canvas.toDataURL("image/png").split(",")[1];
  }, symbolColor);
  await page.route("**/label-test-sprite*.png", (route) => route.fulfill({ contentType: "image/png", body: Buffer.from(sprite, "base64") }));
  await page.route("**/label-test-sprite*.json", (route) => route.fulfill({ json: {
    place: { x: 0, y: 0, width: 24, height: 24, pixelRatio: 1 },
  } }));
  const origin = new URL(page.url()).origin;
  await page.route("https://tiles.openfreemap.org/styles/bright", (route) => route.fulfill({ json: {
    version: 8,
    sprite: `${origin}/label-test-sprite`,
    sources: {
      places: { type: "geojson", data: {
        type: "Feature", properties: {}, geometry: { type: "Point", coordinates: MACAU_CENTER },
      } },
    },
    layers: [
      { id: "background", type: "background" },
      { id: "label_city", type: "symbol", source: "places", layout: { "icon-image": "place" } },
    ],
  } }));
  const openMap = async () => {
    if (isMobile) await page.locator(".view-switch").getByRole("button", { name: "地圖", exact: true }).click();
  };
  await page.reload();
  await openMap();
  await expect.poll(() => countCanvasColor(page, symbolColor)).toBeGreaterThan(50);
  await page.getByRole("tab", { name: "巴士", exact: true }).click();
  await page.locator(".route-grid button").first().click();
  await expect(page.locator(".stop-row")).toBeVisible();
  await openMap();
  await expect(page.locator(".quick-3d")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => countCanvasColor(page, symbolColor)).toBe(0);
  await page.locator(".quick-3d").click();
  await expect(page.locator(".quick-3d")).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => countCanvasColor(page, symbolColor)).toBe(0);
  await page.locator(".bus-map-note summary").click();
  await expect(page.locator(".bus-map-note p")).toBeVisible();
  await expect(page.locator(".bus-map-note p")).toContainText("並非實測 GPS");
  await page.getByRole("tab", { name: "出行", exact: true }).click();
  await openMap();
  await expect.poll(() => countCanvasColor(page, symbolColor)).toBeGreaterThan(50);
});
