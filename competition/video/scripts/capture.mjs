import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import {
  assetsDir,
  loadNarration,
  loadProject,
  rawDir,
  workDir,
} from "./lib.mjs";

const APP_URL = process.env.APP_URL ?? "http://localhost:3200";
const VIEWPORT = { width: 1920, height: 1080 };

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function warmSources() {
  const endpoints = [
    "/api/v1/traffic/roads",
    "/api/v1/traffic/bridges",
    "/api/v1/weather",
    "/api/v1/parking",
    "/api/v1/traffic/notices",
    "/api/v1/borders",
    "/api/v1/lrt/notices",
    "/api/v1/lrt/network",
    "/api/v1/bus/routes",
  ];
  await Promise.all(
    endpoints.map((endpoint) =>
      fetch(`${APP_URL}${endpoint}`).catch(() => null),
    ),
  );

  const response = await fetch(`${APP_URL}/api/v1/assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: "Warm up: which bridge is slowest right now?",
      locale: "en",
    }),
  }).catch(() => null);

  if (!response || !response.ok) {
    throw new Error(
      `The assistant is not answering (${response ? response.status : "no response"}). Start the app with ASSISTANT_API_KEY, ASSISTANT_BASE_URL and ASSISTANT_MODEL set, then run the capture again.`,
    );
  }
  console.log("[capture] sources and assistant are warm");
}

const DEMO_CSS = `
  #demo-caption {
    position: fixed;
    left: 50%;
    bottom: 34px;
    transform: translateX(-50%);
    max-width: 1560px;
    padding: 15px 28px;
    background: rgba(7, 20, 15, 0.84);
    color: #ffffff;
    font: 600 33px/1.35 "Helvetica Neue", Arial, sans-serif;
    text-align: center;
    white-space: pre-line;
    border-radius: 10px;
    z-index: 2147483000;
    opacity: 0;
    transition: opacity 0.25s ease;
  }
  #demo-overlay {
    position: fixed;
    inset: 0;
    z-index: 2147482900;
    display: none;
    font-family: "Helvetica Neue", Arial, sans-serif;
  }
  #demo-cursor {
    position: fixed;
    left: 0;
    top: 0;
    width: 20px;
    height: 20px;
    margin: -10px 0 0 -10px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.9);
    border: 3px solid rgba(8, 120, 90, 0.95);
    box-shadow: 0 0 0 7px rgba(8, 120, 90, 0.22);
    pointer-events: none;
    z-index: 2147483100;
    opacity: 0;
  }
  .demo-card {
    animation: demoCardIn 0.45s ease-out both;
  }
  @keyframes demoCardIn {
    from { opacity: 0; transform: translateY(18px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

function titleCard(project) {
  return `
    <div class="demo-card" style="position:absolute;inset:0;background:linear-gradient(160deg,#062b20 0%,#0a4a35 62%,#0c5c41 100%);display:flex;flex-direction:column;justify-content:center;padding:0 140px;color:#fff">
      <div style="font-size:24px;letter-spacing:3px;color:#9fd8c2;font-weight:700;text-transform:uppercase">${escapeHtml(project.category)} · ${escapeHtml(project.city)} · 2026</div>
      <h1 style="font-size:92px;font-weight:800;margin:30px 0 6px;letter-spacing:0">${escapeHtml(project.displayName)}</h1>
      <p style="font-size:38px;color:#d5ece1;margin:0 0 52px">${escapeHtml(project.subtitle)}</p>
      <p style="font-size:29px;color:#9fd8c2;margin:0">${escapeHtml(project.teamName)} · ${escapeHtml(project.school)}</p>
    </div>
  `;
}

function problemCard() {
  return `
    <div class="demo-card" style="position:absolute;inset:0;background:rgba(6,20,15,0.6);display:flex;align-items:center;padding-left:120px">
      <div style="width:1120px;background:#fff;border-radius:14px;padding:58px 66px;color:#13201a">
        <div style="font-size:22px;letter-spacing:3px;color:#08785a;font-weight:800">THE PROBLEM</div>
        <h2 style="font-size:52px;margin:16px 0 30px;font-weight:800">Data literacy needs real data</h2>
        <ul style="font-size:31px;line-height:1.62;margin:0;padding-left:36px">
          <li>Macau's live transport data is scattered and written for machines.</li>
          <li>Residents, visitors, and non-Chinese readers cannot easily read it.</li>
          <li>AI answers about today's traffic usually give no way to check them.</li>
        </ul>
      </div>
    </div>
  `;
}

function diagramCard() {
  const box = (label, detail) => `
    <div style="width:268px;padding:26px 20px;background:#f2f7f3;border:2px solid #cfe0d5;border-radius:12px;text-align:center">
      <div style="font-size:24px;font-weight:800;color:#13201a">${label}</div>
      <div style="font-size:19px;color:#5d6f66;margin-top:10px;line-height:1.4">${detail}</div>
    </div>
  `;
  const arrow = `<div style="font-size:44px;color:#08785a;padding:0 14px">&#8594;</div>`;
  return `
    <div class="demo-card" style="position:absolute;inset:0;background:rgba(6,20,15,0.66);display:flex;align-items:center;justify-content:center">
      <div style="width:1640px;background:#fff;border-radius:16px;padding:64px 70px;color:#13201a">
        <div style="font-size:22px;letter-spacing:3px;color:#08785a;font-weight:800">HOW IT WORKS</div>
        <h2 style="font-size:50px;margin:14px 0 44px;font-weight:800">From government feed to grounded answer</h2>
        <div style="display:flex;align-items:center;justify-content:center">
          ${box("Official feeds", "DSAT · SMG · MLM · FSM")}
          ${arrow}
          ${box("Server adapters", "parse and normalize only")}
          ${arrow}
          ${box("Typed contracts + cache", "stale fallback · locks · rate limits")}
          ${arrow}
          ${box("AI snapshot", "small JSON per question")}
          ${arrow}
          ${box("Explained answer", "cited snapshot · no personal data")}
        </div>
        <p style="font-size:24px;color:#5d6f66;margin:44px 0 0;text-align:center">The provider key stays on the server. Raw payloads are never sent to the model or the browser.</p>
      </div>
    </div>
  `;
}

function resultsCard(project) {
  const verification = project.verification;
  const stat = (value, label) => `
    <div style="flex:1;padding:30px 24px;background:#f2f7f3;border:2px solid #cfe0d5;border-radius:12px;text-align:center">
      <div style="font-size:58px;font-weight:800;color:#08785a;line-height:1">${escapeHtml(value)}</div>
      <div style="font-size:21px;color:#5d6f66;margin-top:14px;line-height:1.4">${label}</div>
    </div>
  `;
  return `
    <div class="demo-card" style="position:absolute;inset:0;background:rgba(6,20,15,0.66);display:flex;align-items:center;justify-content:center">
      <div style="width:1560px;background:#fff;border-radius:16px;padding:62px 70px;color:#13201a">
        <div style="font-size:22px;letter-spacing:3px;color:#08785a;font-weight:800">LIVE RESULTS</div>
        <h2 style="font-size:50px;margin:14px 0 40px;font-weight:800">Answered from live official data</h2>
        <div style="display:flex;gap:26px">
          ${stat("8 + 7", "bus 3 vehicles, outbound and returning, in one answer")}
          ${stat("59", "monitored segments read for one avenue")}
          ${stat("2-3 s", "measured answer time on the live deployment")}
        </div>
        <p style="font-size:26px;color:#37463e;margin:44px 0 0;line-height:1.5">All ${escapeHtml(verification.liveSources)} official sources returned valid data on ${escapeHtml(verification.date)}. A community pilot with the prepared test kit is the next step; no user-study data is claimed yet.</p>
      </div>
    </div>
  `;
}

function impactCard(project) {
  return `
    <div class="demo-card" style="position:absolute;inset:0;background:linear-gradient(160deg,#062b20 0%,#0a4a35 62%,#0c5c41 100%);display:flex;flex-direction:column;justify-content:center;padding:0 150px;color:#fff">
      <div style="font-size:24px;letter-spacing:3px;color:#9fd8c2;font-weight:700">IMPACT</div>
      <h2 style="font-size:64px;margin:22px 0 40px;font-weight:800">Live data, usable by everyone</h2>
      ${project.sdgs
        .map(
          (sdg) =>
            `<p style="font-size:36px;color:#d5ece1;margin:0 0 18px">• ${escapeHtml(sdg)}</p>`,
        )
        .join("")}
      <p style="font-size:28px;color:#9fd8c2;margin:56px 0 0">${escapeHtml(project.liveUrl)}</p>
      <p style="font-size:26px;color:#9fd8c2;margin:14px 0 0">${escapeHtml(project.teamName)} · ${escapeHtml(project.school)}</p>
    </div>
  `;
}

async function snap(page, name) {
  await mkdir(assetsDir, { recursive: true });
  // Document screenshots must not contain the video caption bar or the fake
  // cursor, so hide them for the shot and restore them right after.
  await page.evaluate(() => {
    document.getElementById("demo-caption")?.style.setProperty("visibility", "hidden");
    document.getElementById("demo-cursor")?.style.setProperty("opacity", "0");
  });
  await page.screenshot({ path: path.join(assetsDir, name) });
  await page.evaluate(() => {
    document.getElementById("demo-caption")?.style.removeProperty("visibility");
  });
  console.log(`[capture] screenshot ${name}`);
}

async function moveCursor(page, locator) {
  const box = await locator.boundingBox().catch(() => null);
  if (!box) return;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 14 });
  await page.evaluate(
    ({ x: cx, y: cy }) => {
      const cursor = document.getElementById("demo-cursor");
      if (!cursor) return;
      cursor.style.opacity = "1";
      cursor.style.transform = `translate(${cx}px, ${cy}px)`;
    },
    { x, y },
  );
}

async function clickTab(page, name) {
  const tab = page.locator(".desktop-panel").getByRole("tab", { name });
  await moveCursor(page, tab);
  await tab.click({ timeout: 8000 });
}

const actions = {
  async openBus(page) {
    await clickTab(page, "巴士");
    await page.waitForTimeout(400);
    const route = page.locator(".desktop-panel .route-grid button").first();
    await moveCursor(page, route);
    await route.click({ timeout: 12_000 });
    await page
      .locator(".desktop-panel .eta-list")
      .waitFor({ timeout: 25_000 })
      .catch(() => console.warn("[capture] bus eta list did not appear in time"));
    await snap(page, "desktop-bus.png");
  },
  async openLrt(page) {
    await clickTab(page, "輕軌");
    await page.waitForTimeout(400);
    const line = page.locator(".desktop-panel .lrt-lines button").first();
    await moveCursor(page, line);
    await line.click({ timeout: 8000 }).catch(() => null);
    await page.waitForTimeout(600);
    await snap(page, "desktop-lrt.png");
  },
  async openParking(page) {
    await clickTab(page, "泊車");
    await page.waitForTimeout(500);
    await snap(page, "desktop-parking.png");
  },
  async openCameras(page) {
    await clickTab(page, "鏡頭");
    await page.waitForTimeout(500);
    await snap(page, "desktop-cameras.png");
  },
  async backOverview(page) {
    await clickTab(page, "總覽");
    await page.waitForTimeout(700);
    await snap(page, "desktop-overview.png");
  },
  async openAssistant(page) {
    await clickTab(page, "AI 助手");
    await page.waitForTimeout(400);
  },
  async askZh(page) {
    const suggestion = page
      .locator(".desktop-panel .assistant-suggestions button")
      .first();
    await moveCursor(page, suggestion);
    await suggestion.click({ timeout: 8000 });
    await page
      .locator(".desktop-panel .assistant-answer")
      .first()
      .waitFor({ timeout: 120_000 });
    await snap(page, "desktop-assistant-zh.png");
  },
  async switchEnglish(page) {
    const english = page.getByTitle("English");
    await moveCursor(page, english);
    await english.click({ timeout: 8000 });
    await page.waitForTimeout(700);
  },
  async askEn(page) {
    const textarea = page.locator(".desktop-panel .assistant-form textarea");
    await moveCursor(page, textarea);
    await textarea.fill(
      "Where is bus 3 right now, and which direction is it heading?",
    );
    await page.locator(".desktop-panel .assistant-form button").click();
    await page
      .locator(".desktop-panel .assistant-answer")
      .nth(1)
      .waitFor({ timeout: 120_000 });
    await snap(page, "desktop-assistant-en.png");
  },
  async openAssistantBusTab(page) {
    const button = page.locator(".desktop-panel .assistant-action").first();
    await moveCursor(page, button);
    await button.click({ timeout: 8000 });
    await page.waitForTimeout(1_500);
    await snap(page, "desktop-bus-follow.png");
  },
};

async function main() {
  const project = await loadProject();
  const narration = await loadNarration();
  const timings = JSON.parse(
    await readFile(path.join(workDir, "timings.json"), "utf8"),
  );
  await mkdir(rawDir, { recursive: true });
  await mkdir(assetsDir, { recursive: true });

  await warmSources();

  const browser = await chromium.launch({ headless: true });
  const recordedAt = Date.now();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: rawDir, size: VIEWPORT },
  });
  const page = await context.newPage();

  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.locator(".maplibregl-canvas").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(4_500);
  const readyAt = Date.now();
  const trimStart = Math.max(0, (readyAt - recordedAt) / 1000);
  console.log(`[capture] page ready, trim ${trimStart.toFixed(2)}s of load time`);

  await page.addStyleTag({ content: DEMO_CSS });
  await page.evaluate(() => {
    for (const id of ["demo-overlay", "demo-caption", "demo-cursor"]) {
      const element = document.createElement("div");
      element.id = id;
      document.body.appendChild(element);
    }
  });

  const t0 = Date.now() + (narration.leadInSeconds ?? 1) * 1000;
  const events = [];
  for (const scene of timings.scenes) {
    const overlayByKind = {
      "title-card": titleCard(project),
      "problem-card": problemCard(),
      "diagram-card": diagramCard(),
      "results-card": resultsCard(project),
      "impact-card": impactCard(project),
    };
    const html = overlayByKind[scene.kind];
    events.push({
      delay: Math.max(0, t0 + scene.start * 1000 - Date.now()),
      op: "overlay",
      html: html ?? "",
    });
    for (const cue of scene.cues) {
      events.push({
        delay: Math.max(0, t0 + cue.start * 1000 - Date.now()),
        op: "caption",
        text: cue.text,
      });
    }
  }
  events.sort((a, b) => a.delay - b.delay);
  await page.evaluate((scheduled) => {
    const overlay = document.getElementById("demo-overlay");
    const caption = document.getElementById("demo-caption");
    for (const event of scheduled) {
      const apply = () => {
        if (event.op === "overlay") {
          if (!overlay) return;
          if (event.html) {
            overlay.innerHTML = event.html;
            overlay.style.display = "block";
          } else {
            overlay.style.display = "none";
            overlay.innerHTML = "";
          }
        } else if (event.op === "caption" && caption) {
          caption.textContent = event.text;
          caption.style.opacity = "1";
        }
      };
      if (event.delay <= 0) apply();
      else setTimeout(apply, event.delay);
    }
  }, events);

  const steps = timings.scenes
    .flatMap((scene) =>
      scene.steps.map((step) => ({
        at: t0 + (scene.start + step.at) * 1000,
        scene: scene.id,
        action: step.action,
      })),
    )
    .sort((a, b) => a.at - b.at);

  for (const step of steps) {
    const waitMs = step.at - Date.now();
    if (waitMs > 0) await wait(waitMs);
    const action = actions[step.action];
    if (!action) {
      console.warn(`[capture] unknown action ${step.action}`);
      continue;
    }
    console.log(`[capture] ${step.scene}: ${step.action}`);
    try {
      await action(page);
    } catch (error) {
      console.warn(`[capture] action ${step.action} failed: ${error.message}`);
    }
  }

  const endAt = t0 + timings.totalDuration * 1000 + 800;
  const remaining = endAt - Date.now();
  if (remaining > 0) await wait(remaining);

  const video = page.video();
  await context.close();
  const videoPath = await video.path();
  console.log(`[capture] recorded video: ${videoPath}`);

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await mobilePage.locator(".maplibregl-canvas").waitFor({ timeout: 30_000 });
  await mobilePage.waitForTimeout(4_000);
  await snap(mobilePage, "mobile-overview.png");
  await mobilePage.locator(".sheet-grip").click();
  await mobilePage.waitForTimeout(400);
  await mobilePage
    .locator(".mobile-sheet")
    .getByRole("tab", { name: "AI 助手" })
    .click();
  await mobilePage.waitForTimeout(400);
  await mobilePage
    .locator(".mobile-sheet .assistant-suggestions button")
    .first()
    .click();
  await mobilePage
    .locator(".mobile-sheet .assistant-answer")
    .waitFor({ timeout: 120_000 });
  await snap(mobilePage, "mobile-assistant.png");
  await mobileContext.close();

  await browser.close();

  await writeFile(
    path.join(workDir, "capture-meta.json"),
    `${JSON.stringify(
      {
        appUrl: APP_URL,
        videoPath,
        trimStart,
        recordedAt: new Date(recordedAt).toISOString(),
        totalDuration: timings.totalDuration,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
