import { openSection } from "./navigation";
import { expect, test } from "@playwright/test";
import { mockDashboard } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockDashboard(page);
});

test("a route card animates within the content scope in both directions", async ({
  page,
}) => {
  await page.addInitScript(() => {
    type ScopedElement = Element & {
      startViewTransition?: (update: () => void) => ViewTransition;
    };
    const prototype = Element.prototype as ScopedElement;
    const start = prototype.startViewTransition;
    const observations = {
      scopes: [] as string[],
      sharedCards: 0,
      cardAnimations: 0,
      fallbacks: 0,
      durations: [] as number[],
      documentStarts: 0,
    };
    Object.assign(window, { motionObservations: observations });
    const animate = prototype.animate;
    prototype.animate = function (keyframes, options) {
      const animation = animate.call(this, keyframes, options);
      if (this.id === "workspace-content") {
        observations.fallbacks += 1;
        observations.durations.push(Number(animation.effect?.getComputedTiming().duration));
      }
      return animation;
    };
    if (start)
      prototype.startViewTransition = function (update) {
        observations.scopes.push(this.id);
        const transition = start.call(this, update);
        void transition.ready.then(
          () => {
            if (
              this.querySelector(
                '[style*="view-transition-name: workspace-card"]',
              )
            )
              observations.sharedCards += 1;
            for (const animation of this.getAnimations({ subtree: true })) {
              const effect = animation.effect as KeyframeEffect | null;
              if (effect?.pseudoElement?.includes("workspace-card")) {
                observations.cardAnimations += 1;
                observations.durations.push(
                  Number(effect.getComputedTiming().duration),
                );
              }
            }
          },
          () => {},
        );
        return transition;
      };
    const documentStart = document.startViewTransition.bind(document);
    document.startViewTransition = (options) => {
      observations.documentStarts += 1;
      return documentStart(options);
    };
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("tab", { name: "巴士", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const route = page.locator(".route-grid button").first();
  const routeCode = await route.getAttribute("data-route-code");
  await route.click();
  await expect(page.locator(".bus-route-header")).toBeFocused();
  // Chromium can reject a snapshot. The scoped panel still animates in that case.
  const countAnimations = () => page.evaluate(() => {
    const { sharedCards, fallbacks } = (window as unknown as {
      motionObservations: { sharedCards: number; fallbacks: number };
    }).motionObservations;
    return sharedCards + fallbacks;
  });
  await expect.poll(countAnimations).toBe(1);
  await page.locator(".bus-route-header .text-action").first().click();
  await expect(page.locator(".route-grid button").first()).toBeFocused();
  await expect(page.locator(".route-grid button").first()).toHaveAttribute(
    "data-route-code",
    routeCode!,
  );
  await expect.poll(countAnimations).toBe(2);
  const observations = await page.evaluate(
    () =>
      (
        window as unknown as {
          motionObservations: {
            scopes: string[];
            documentStarts: number;
            cardAnimations: number;
            fallbacks: number;
            durations: number[];
          };
        }
      ).motionObservations,
  );
  expect(observations.scopes).toEqual(["workspace-content", "workspace-content"]);
  expect(observations.documentStarts).toBe(0);
  expect(observations.cardAnimations + observations.fallbacks).toBeGreaterThan(0);
  expect(
    observations.durations.every((duration) => duration > 0 && duration <= 280),
  ).toBe(true);
});

test("rapid section changes finish at the last destination and keep keyboard navigation usable", async ({
  page, isMobile,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("tab", { name: "巴士", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("tab", { name: isMobile ? "AI 助手" : "輕軌", exact: true }),
  ).toBeFocused();
  await expect(page.locator(".workspace-panel")).toHaveAttribute(
    "data-tab",
    isMobile ? "assistant" : "lrt",
  );
  await expect(page.locator(isMobile ? ".assistant-form" : ".lrt-lines")).toBeVisible();
  expect(errors).toEqual([]);
});

test("reduced motion and unsupported scoped transitions keep navigation immediate", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, "startViewTransition", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto("/");
  await openSection(page, "泊車");
  await page.locator(".parking-row").first().click();
  await expect(page.locator(".parking-detail")).toBeInViewport();
  expect(
    await page
      .locator(".workspace-scroll")
      .evaluate((element) => element.getAnimations().length),
  ).toBe(0);
  await page.getByRole("tab", { name: "巴士", exact: true }).click();
  await page.locator(".route-grid button").first().click();
  await expect(page.locator(".stop-row")).toBeVisible();
});

test("a card interaction cannot strand a later navigation request", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "巴士", exact: true }).click();
  await expect(page.locator(".route-grid button").first()).toBeVisible();
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>("#nav-parking")!.click();
    document.querySelector<HTMLButtonElement>(".route-grid button")!.click();
    document.querySelector<HTMLButtonElement>("#nav-parking")!.click();
  });
  await expect(page.locator(".workspace-panel")).toHaveAttribute(
    "data-tab",
    "parking",
  );
  await expect(page.locator(".parking-row")).toBeVisible();
});

test("browsers without scoped transitions animate the content and retain drill-in navigation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, "startViewTransition", {
      configurable: true,
      value: undefined,
    });
    const animate = Element.prototype.animate;
    const samples: number[] = [];
    Object.assign(window, { fallbackDurations: samples });
    Element.prototype.animate = function (keyframes, options) {
      const animation = animate.call(this, keyframes, options);
      if (this.id === "workspace-content")
        samples.push(Number(animation.effect?.getComputedTiming().duration));
      return animation;
    };
  });
  await page.goto("/");
  await page.getByRole("tab", { name: "巴士", exact: true }).click();
  await page.locator(".route-grid button").first().click();
  await expect(page.locator(".bus-route-header")).toBeFocused();
  const durations = await page.evaluate(
    () =>
      (window as unknown as { fallbackDurations: number[] }).fallbackDurations,
  );
  expect(durations.length).toBeGreaterThanOrEqual(2);
  expect(durations.every((duration) => duration === 220)).toBe(true);
});

test("mobile view transitions remove outgoing controls and transfer focus while desktop stays interactive", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await openSection(page, "輕軌");
  await page.locator(".lrt-lines button").first().click();
  await page.locator(".lrt-station-button").first().click();
  if (isMobile) {
    await expect(page.locator(".workspace-panel")).toHaveAttribute("inert", "");
    await expect(
      page.getByRole("button", { name: "列表", exact: true }),
    ).toHaveCount(1);
    await expect(page.locator(".map-return")).toBeFocused();
    await page.locator(".map-return").click();
    await expect(page.locator(".workspace-map")).toHaveAttribute("inert", "");
    await expect(
      page.locator('.view-switch [aria-pressed="true"]'),
    ).toBeFocused();
    await page.setViewportSize({ width: 1024, height: 768 });
  }
  await expect(page.locator(".workspace-panel")).not.toHaveAttribute("inert");
  await expect(page.locator(".workspace-map")).not.toHaveAttribute("inert");
});
