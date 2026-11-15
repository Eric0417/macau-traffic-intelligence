import { expect, type Page } from "@playwright/test";

export async function openMore(page: Page) {
  if (await page.locator(".more-grid").isVisible()) return;
  const mobile = page.locator("#nav-more-mobile");
  await (await mobile.isVisible() ? mobile : page.locator("#nav-more")).click();
  await expect(page.locator(".more-grid")).toBeVisible();
}

export async function openSection(page: Page, name: string) {
  const tab = page.getByRole("tab", { name, exact: true });
  if (await tab.isVisible()) { await tab.click(); return; }
  await openMore(page);
  await page.locator(".more-grid").getByRole("button", { name, exact: true }).click();
}

export async function openManualBusPlanner(page: Page) {
  await openSection(page, "巴士");
  await page.getByRole("button", { name: "用 AI 助手規劃行程", exact: true }).click();
  await page.getByRole("button", { name: "手動揀站", exact: true }).click();
  await expect(page.locator(".journey-planner")).toBeVisible();
}

async function settings(page: Page) {
  const previous = { tab: await page.locator(".workspace-panel").getAttribute("data-tab"), view: await page.locator(".resident-app").getAttribute("data-view") };
  if (await page.locator(".workspace-header-actions").isVisible()) return null;
  await openMore(page);
  const details = page.locator(".mobile-settings");
  if (await details.getAttribute("open") === null) await details.locator("summary").click();
  return previous;
}

async function restore(page: Page, previous: Awaited<ReturnType<typeof settings>>) {
  if (!previous || previous.tab === "more") return;
  const tab = page.locator(`#nav-${previous.tab}`);
  if (await tab.isVisible()) await tab.click();
  else await page.locator(`.more-grid [data-section="${previous.tab}"]`).click();
  await expect(page.locator(".workspace-panel")).toHaveAttribute("data-tab", previous.tab!);
  if (previous.view === "map") await page.locator(".view-switch button").last().click();
}

export async function toggleTheme(page: Page) {
  const previous = await settings(page);
  await page.locator(".appearance-toggle:visible").click();
  await restore(page, previous);
}

export async function setLanguage(page: Page, language: string) {
  const previous = await settings(page);
  await page.locator(".language-switch:visible").getByRole("button", { name: language, exact: true }).click();
  await restore(page, previous);
}
