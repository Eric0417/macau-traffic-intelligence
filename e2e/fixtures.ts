import type { Page } from "@playwright/test";

export function meta(source: { id: string; name: string; url: string }) {
  return {
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
  "/api/v1/assistant": { answer: "友誼大橋目前較慢，請核對官方路況。", model: "fixture", locale: "zh-Hant", snapshotAt: new Date().toISOString(), contextSummary: ["官方道路狀態"] },
  "/api/v1/traffic/news": { items: [{ id: "gcs:test", title: "官方航班暫停通知", content: "官方公布的安排。", publishedAt: "2026-11-10T08:16:00.000Z", category: "general", url: "https://www.gcs.gov.mo/detail/zh-hant/test" }], feeds: [{ name: "新聞局政府新聞", url: "https://govinfohub.gcs.gov.mo/api/rss/n/zh-hant", available: true }, { name: "交通事務局新聞", url: "https://www.dsat.gov.mo/tc/news_rss.aspx", available: false }] },
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
      coordinates: [113.5345, 22.1908],
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

export async function mockDashboard(page: Page) {
  await page.route("**/*.m3u8", (route) => route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: "#EXTM3U\n#EXT-X-ENDLIST\n" }));
  await page.route("https://tiles.openfreemap.org/styles/bright", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#e9eeef" } }] }),
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
                stopsAway: 0,
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
                busType: "1",
                lowFloor: true,
                speedKph: 12,
                status: "1",
                stationCode: "M1/9",
                stationName: "關閘總站",
                stationSequence: 0,
                segmentIndex: 0,
                coordinates: [113.54918, 22.215502],
                bearing: 180,
                estimated: true,
              },
            ],
            routeSegments: [
              {
                fromStationCode: "M1/9",
                toStationCode: "M1/9",
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
