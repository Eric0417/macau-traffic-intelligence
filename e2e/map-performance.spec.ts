import { expect, test } from "@playwright/test";
import { mockDashboard } from "./fixtures";

test("a stationary 3D bus keeps native canvas detail without continuous WebGL work", async ({ page, isMobile }, testInfo) => {
  await page.addInitScript(() => {
    const metrics = { draws: 0 };
    (window as typeof window & { mapMetrics: typeof metrics }).mapMetrics = metrics;
    for (const key of ["drawElements", "drawArrays"] as const) {
      const original = WebGL2RenderingContext.prototype[key];
      Object.defineProperty(WebGL2RenderingContext.prototype, key, {
        value: function (...args: unknown[]) {
          metrics.draws += 1;
          return Reflect.apply(original, this, args);
        },
      });
    }
  });
  await mockDashboard(page);
  await page.goto("/");
  await page.getByRole("tab", { name: "巴士", exact: true }).click();
  const etaResponse = page.waitForResponse("**/api/v1/bus/routes/00003/eta?direction=0");
  await page.locator(".route-grid button").first().click();
  const eta = await (await etaResponse).json();
  await page.locator(".stop-row").click();
  if (isMobile) await page.locator(".view-switch").getByRole("button", { name: "地圖", exact: true }).click();
  const model = page.waitForResponse("**/models/bus-tcm.glb");
  await page.locator(".quick-3d").click();
  await model;
  // Let the camera and shader compilation finish; measure a frozen publisher
  // position while the normal two-second route polling remains enabled.
  await page.waitForTimeout(2_000);
  const initial = await page.evaluate(() => (window as unknown as { mapMetrics: { draws: number } }).mapMetrics.draws);
  await page.waitForTimeout(3_000);
  const report = await page.locator(".maplibregl-canvas").evaluate((element, initial) => {
    const canvas = element as HTMLCanvasElement;
    const gl = canvas.getContext("webgl2")!;
    return {
      drawsInThreeSeconds: (window as unknown as { mapMetrics: { draws: number } }).mapMetrics.draws - initial,
      antialias: gl.getContextAttributes()?.antialias,
      samples: gl.getParameter(gl.SAMPLES),
      devicePixelRatio,
      pixels: [canvas.width, canvas.height],
      client: [canvas.clientWidth, canvas.clientHeight],
    };
  }, initial);
  console.log(JSON.stringify({ project: testInfo.project.name, ...report }));
  await testInfo.attach("stationary-map-rendering", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
  expect(report.antialias).toBe(true);
  expect(report.pixels[0]).toBeGreaterThanOrEqual(Math.floor(report.client[0] * report.devicePixelRatio));
  expect(report.drawsInThreeSeconds).toBeLessThan(200);

  // A subsequent official position must restart the glide after the idle loop
  // stopped. Keep the new point on the mocked official route geometry.
  await page.route("**/api/v1/bus/routes/00003/eta?direction=0", (route) => route.fulfill({
    json: { ...eta, data: { ...eta.data, vehicles: eta.data.vehicles.map((vehicle: object) => ({ ...vehicle, coordinates: [113.54914, 22.21530] })) } },
  }));
  await page.waitForResponse("**/api/v1/bus/routes/00003/eta?direction=0");
  const movingStart = await page.evaluate(() => (window as unknown as { mapMetrics: { draws: number } }).mapMetrics.draws);
  await page.waitForTimeout(1_000);
  const movingDraws = await page.evaluate((start) => (window as unknown as { mapMetrics: { draws: number } }).mapMetrics.draws - start, movingStart);
  expect(movingDraws).toBeGreaterThan(200);
});
