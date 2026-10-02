import { expect, test, type Page } from "@playwright/test";

function meta(source: { id: string; name: string; url: string }) {
  return {
    generatedAt: "2026-10-03T00:00:00.000Z",
    updatedAt: "2026-10-03T00:00:00.000Z",
    stale: false,
    ttlSeconds: 60,
    source: {
      ...source,
      text: source.name,
    },
  };
}

const roads = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        id: "1",
        name: {
          "zh-Hant": "友誼大馬路",
          "zh-Hans": "友谊大马路",
          en: "Avenida da Amizade",
        },
        nameVisible: true,
        lengthMeters: 100,
        status: "congested",
        officialLevel: 3,
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [113.55, 22.19],
          [113.56, 22.2],
        ],
      },
    },
  ],
};

const cameras = [
  {
    id: "49",
    name: {
      "zh-Hant": "新馬路與南灣大馬路交界",
      "zh-Hans": "新马路与南湾大马路交界",
      en: "Avenida de Almeida Ribeiro",
    },
    location: {
      "zh-Hant": "新馬路與南灣大馬路交界",
      "zh-Hans": "新马路与南湾大马路交界",
      en: "Avenida de Almeida Ribeiro",
    },
    coordinates: [113.54, 22.19],
    zone: { "zh-Hant": "澳門區", "zh-Hans": "澳门区", en: "Macao peninsula" },
    subzone: { "zh-Hant": "中區-1", "zh-Hans": "中区-1", en: "Central-1" },
    streamUrl: "https://example.com/camera.m3u8",
    mediaType: "hls",
  },
];

const responses: Record<string, unknown> = {
  "/api/v1/traffic/roads": roads,
  "/api/v1/traffic/bridges": [
    {
      id: "sai-van-n",
      name: { "zh-Hant": "西灣大橋", "zh-Hans": "西湾大桥", en: "Sai Van Bridge" },
      direction: "northbound",
      runtimeSeconds: 120,
      status: "normal",
      officialLevel: 1,
    },
  ],
  "/api/v1/traffic/notices": [
    {
      id: "notice-1",
      title: "友誼大馬路臨時交通安排",
      content: "臨時交通措施測試資料。",
      publishedAt: null,
      category: "roadworks",
      url: "https://www.dsat.gov.mo/",
    },
  ],
  "/api/v1/cameras": cameras,
  "/api/v1/bus/routes": [
    {
      routeName: "3",
      routeCode: "00003",
      routeType: 0,
      company: { id: "orange", name: "澳巴", color: "orange" },
      hasChange: true,
      live: true,
    },
  ],
  "/api/v1/parking": [
    {
      id: "6033",
      name: "下環街市",
      updatedAt: "2026-10-03T00:00:00.000Z",
      areaStatus: "yellow",
      availability: {
        lightVehicle: 13,
        motorcycle: 48,
        electricVehicle: 4,
        electricMotorcycle: 10,
        accessible: 2,
        heavyVehicleShort: null,
        heavyVehicleLong: null,
      },
    },
  ],
  "/api/v1/weather": {
    observedAt: "2026-10-03T00:00:00.000Z",
    temperatureCelsius: 28,
    humidityPercent: 82,
    wind: "風向: 東南偏東 ; 風速: 8.6 公里/小時",
    forecast: "大致多雲，有幾陣驟雨。",
    warnings: [],
  },
  "/api/v1/borders": [
    {
      id: "portas-do-cerco",
      name: { "zh-Hant": "關閘", "zh-Hans": "关闸", en: "Portas do Cerco" },
      status: "clear",
      estimatedWaitMinutes: 10,
      updatedAt: "2026-10-03T00:00:00.000Z",
      sourceUrl: "https://www.fsm.gov.mo/psp/pspmonitor/mobile/",
    },
  ],
  "/api/v1/lrt/network": {
    lines: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            id: "1",
            ref: "Taipa",
            name: { "zh-Hant": "氹仔線", "zh-Hans": "氹仔线", en: "Taipa Line" },
            color: "#96C93C",
          },
          geometry: {
            type: "LineString",
            coordinates: [
              [113.574, 22.163],
              [113.545, 22.187],
            ],
          },
        },
      ],
    },
    stations: [
      {
        id: "TFT",
        name: { "zh-Hant": "氹仔碼頭站", "zh-Hans": "氹仔码头站", en: "Taipa Ferry Terminal" },
        coordinates: [113.574, 22.163],
        lines: ["Taipa"],
        interchange: false,
      },
      {
        id: "BARRA",
        name: { "zh-Hant": "媽閣站", "zh-Hans": "妈阁站", en: "Barra" },
        coordinates: [113.545, 22.187],
        lines: ["Taipa"],
        interchange: true,
      },
    ],
    timetableEdition: "2026-09",
    sourceUpdatedAt: "2026-10-03T00:00:00.000Z",
  },
  "/api/v1/lrt/notices": [],
};

async function mockDashboard(page: Page) {
  await page.route("https://tiles.openfreemap.org/styles/bright", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ version: 8, sources: {}, layers: [] }),
    });
  });

  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const etaMatch = url.pathname.match(/^\/api\/v1\/bus\/routes\/([^/]+)\/eta$/);
    if (etaMatch) {
      await route.fulfill({
        json: {
          data: {
            routeName: "3",
            routeCode: etaMatch[1],
            direction: 0,
            stops: [
              {
                sequence: 0,
                stationCode: "M1/9",
                stationName: "關閘總站",
                etaMinutes: 3,
                averageMinutes: 5,
                messageCode: "0",
                coordinates: [113.54918, 22.215502],
                trafficStatus: "normal",
                trafficLevel: 1,
                suspended: false,
              },
            ],
            vehicles: [
              {
                id: "E5054",
                plate: "AD2767",
                lowFloor: true,
                speedKph: 12,
                status: "1",
                stationCode: "M1/9",
                stationName: "關閘總站",
                stationSequence: 0,
                coordinates: [113.54918, 22.215502],
                bearing: 180,
                estimated: true,
              },
            ],
            routeSegments: [
              {
                trafficStatus: "normal",
                trafficLevel: 1,
                coordinates: [
                  [113.54918, 22.215502],
                  [113.54862, 22.212759],
                ],
              },
            ],
            diversion: { suspendedStops: [] },
          },
          meta: meta({ id: "bus-eta", name: "DSAT Bus ETA", url: "https://www.dsat.gov.mo/" }),
        },
      });
      return;
    }

    const body = responses[url.pathname];
    await route.fulfill({
      status: body ? 200 : 404,
      json: body
        ? {
            data: body,
            meta: meta({ id: url.pathname, name: "Test source", url: "https://example.com/" }),
          }
        : { message: "Not mocked" },
    });
  });
}

async function countCanvasColor(page: Page, rgb: [number, number, number]) {
  const shot = await page.locator(".maplibregl-canvas").screenshot();
  return page.evaluate(
    async ({ base64, rgb }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (!context) return 0;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let matches = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (
          Math.abs(pixels[index] - rgb[0]) < 24 &&
          Math.abs(pixels[index + 1] - rgb[1]) < 24 &&
          Math.abs(pixels[index + 2] - rgb[2]) < 24
        ) {
          matches += 1;
        }
      }
      return matches;
    },
    { base64: shot.toString("base64"), rgb },
  );
}

test("desktop map renders the overview and mocked live modules", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop project only");
  await mockDashboard(page);
  await page.goto("/");

  const panel = page.locator(".desktop-panel");
  await expect(panel).toBeVisible();
  await expect(page.getByText("澳門交通情報").first()).toBeVisible();
  await expect(panel.getByText("跨海大橋")).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
});

test("map layers paint after style load and respond to the layer toggle", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "desktop project only");
  await mockDashboard(page);
  await page.goto("/");

  const congested = [215, 71, 52] as [number, number, number];
  await expect.poll(() => countCanvasColor(page, congested)).toBeGreaterThan(0);

  await page.getByRole("button", { name: /圖層/ }).click();
  await page.getByRole("checkbox", { name: "道路" }).click();
  await expect.poll(() => countCanvasColor(page, congested)).toBe(0);
});

test("bus and parking panels use normalized API data", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop project only");
  await mockDashboard(page);
  await page.goto("/");
  const panel = page.locator(".desktop-panel");

  await panel.getByRole("tab", { name: "巴士" }).click();
  await panel.locator(".route-grid button").first().click();
  await expect(panel.locator(".eta-list")).toContainText("關閘總站");
  await expect(panel.locator(".route-detail-head strong")).toHaveText("3");
  await expect(panel.locator(".vehicle-row strong")).toHaveText("AD2767");
  await expect(panel.locator(".vehicle-row")).toContainText("低地台");

  await panel.getByRole("tab", { name: "泊車" }).click();
  await expect(panel.getByText("下環街市")).toBeVisible();
  await expect(panel.getByText("13")).toBeVisible();
});

test("LRT panel selects a line and lists its stations", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop project only");
  await mockDashboard(page);
  await page.goto("/");
  const panel = page.locator(".desktop-panel");

  await panel.getByRole("tab", { name: "輕軌" }).click();
  await panel.locator(".lrt-lines button").first().click();

  await expect(panel.locator(".lrt-stations li")).toHaveCount(2);
  await expect(panel.locator(".lrt-stations")).toContainText("氹仔碼頭站");
  await expect(panel.locator(".lrt-interchange")).toHaveText("轉乘站");
});

test("camera panel opens the accessible viewer", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop project only");
  await mockDashboard(page);
  await page.goto("/");
  const panel = page.locator(".desktop-panel");

  await panel.getByRole("tab", { name: "鏡頭" }).click();
  await panel.getByRole("button", { name: /新馬路/ }).click();

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByText("新馬路與南灣大馬路交界").first()).toBeVisible();
});

test("mobile bottom sheet expands and language changes", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile project only");
  await mockDashboard(page);
  await page.goto("/");

  const sheet = page.locator(".mobile-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute("data-expanded", "false");
  await sheet.locator(".sheet-grip").click();
  await expect(sheet).toHaveAttribute("data-expanded", "true");

  await page.getByTitle("English").click();
  await expect(sheet.getByText("Overview")).toBeVisible();
});
