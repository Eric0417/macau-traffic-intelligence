import { afterEach, describe, expect, it, vi } from "vitest";
import * as cache from "@/server/cache";
import { POST } from "@/app/api/v1/assistant/route";
import {
  buildAssistantMessages,
  buildLearningSnapshot,
  callAssistantProvider,
  extractPlaceQuery,
  findMentionedSegments,
  looksBusRelated,
  matchLrtLine,
  matchLrtStation,
  matchNamedRoutes,
  type LearningSnapshot,
} from "@/server/sources/assistant";
import type { BusRoute, LrtNetwork, RoadCollection } from "@/lib/types";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const snapshot: LearningSnapshot = {
  generatedAt: "2026-10-09T07:00:00.000Z",
  weather: {
    observedAt: "2026-10-09T06:50:00.000Z",
    temperatureCelsius: 27,
    humidityPercent: 80,
    wind: "東風 3 級",
    activeWarnings: [],
  },
  bridges: [
    {
      name: "友誼大橋",
      direction: "northbound",
      travelMinutes: 4,
      status: "slow",
    },
  ],
  roads: {
    monitoredSegments: 1268,
    counts: { normal: 1200, slow: 60, congested: 8, unknown: 0 },
    congestedSegments: [{ name: "友誼大馬路", lengthMeters: 320 }],
    slowSegments: [{ name: "巴波沙大馬路", lengthMeters: 210 }],
    mentionedSegments: [],
    note: "Live status covers only monitored segments.",
  },
  parking: [],
  borders: [],
  notices: [],
  lrtNotices: [],
  bus: null,
  lrt: null,
};

it("treats publication and snapshot time separately and never infers no incidents", () => {
  const system = buildAssistantMessages("有冇事故？", "zh-Hant", snapshot)[0].content;
  expect(system).toContain("not a complete live incident feed");
  expect(system).toContain("does not mean no incidents");
  expect(system).toContain("Never derive border waiting minutes");
});

const routes: BusRoute[] = [
  {
    routeName: "3",
    routeCode: "00003",
    routeType: 0,
    company: { id: "orange", name: "澳巴", color: "orange" },
    hasChange: false,
    live: true,
  },
  {
    routeName: "3X",
    routeCode: "0003X",
    routeType: 0,
    company: { id: "blue", name: "新福利", color: "blue" },
    hasChange: false,
    live: true,
  },
  {
    routeName: "268",
    routeCode: "00268",
    routeType: 0,
    company: { id: "blue", name: "新福利", color: "blue" },
    hasChange: false,
    live: true,
  },
];

const roads: RoadCollection = {
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
        lengthMeters: 320,
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

const lrtNetwork: LrtNetwork = {
  lines: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          id: "1",
          ref: "Taipa",
          name: {
            "zh-Hant": "氹仔線（氹仔碼頭=>媽閣）",
            "zh-Hans": "氹仔线（氹仔码头=>妈阁）",
            en: "Taipa Line (Taipa Ferry Terminal → Barra)",
          },
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
      name: {
        "zh-Hant": "氹仔碼頭站",
        "zh-Hans": "氹仔码头站",
        en: "Taipa Ferry Terminal",
      },
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
};

describe("assistant prompt", () => {
  it("grounds the model in the live snapshot and the requested locale", () => {
    const messages = buildAssistantMessages("哪條橋最慢？", "zh-Hant", snapshot);

    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("Traditional Chinese");
    expect(messages[0].content).toContain("2026-10-09T07:00:00.000Z");
    expect(messages[1].content).toContain("哪條橋最慢？");
    expect(messages[1].content).toContain("友誼大橋");
  });
});

describe("assistant question routing", () => {
  it("matches named bus routes with token boundaries", () => {
    expect(matchNamedRoutes("而家 3 號巴士去到邊？", routes)).toHaveLength(1);
    expect(matchNamedRoutes("而家 3 號巴士去到邊？", routes)[0].routeName).toBe("3");
    expect(matchNamedRoutes("How is route 3X doing?", routes)[0].routeName).toBe("3X");
    expect(matchNamedRoutes("今日 1268 段路有幾多段塞車？", routes)).toHaveLength(0);
  });

  it("detects bus-related questions", () => {
    expect(looksBusRelated("MT4 幾點到？")).toBe(true);
    expect(looksBusRelated("巴士路線正常嗎？")).toBe(true);
    expect(looksBusRelated("今日天氣點？")).toBe(false);
  });

  it("extracts the place in route-serves questions", () => {
    expect(extractPlaceQuery("9號巴士去唔去氹仔？")).toBe("氹仔");
    expect(extractPlaceQuery("Does bus 9 serve Taipa?")).toBe("Taipa");
    expect(extractPlaceQuery("今日天氣點？")).toBeNull();
  });

  it("finds roads named in the question", () => {
    const matches = findMentionedSegments(
      "友誼大馬路而家塞唔塞？",
      roads,
      "zh-Hant",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      name: "友誼大馬路",
      segmentCount: 1,
      statuses: { normal: 0, slow: 0, congested: 1, unknown: 0 },
    });
    expect(findMentionedSegments("今日天氣點？", roads, "zh-Hant")).toHaveLength(0);
  });

  it("matches LRT lines and stations", () => {
    expect(matchLrtLine("氹仔線尾班車幾點？", lrtNetwork)?.ref).toBe("Taipa");
    expect(matchLrtStation("媽閣站有冇輕軌？", lrtNetwork)?.id).toBe("BARRA");
    expect(matchLrtLine("今日天氣點？", lrtNetwork)).toBeNull();
    expect(matchLrtStation("今日天氣點？", lrtNetwork)).toBeNull();
  });
});

describe("assistant provider", () => {
  it("posts an OpenAI-compatible chat completion and returns the text", async () => {
    vi.stubEnv("ASSISTANT_API_KEY", "test-key");
    vi.stubEnv("ASSISTANT_BASE_URL", "https://llm.example.com/v1");
    vi.stubEnv("ASSISTANT_MODEL", "test-model");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ choices: [{ message: { content: "友誼大橋現在較慢。" } }] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const text = await callAssistantProvider([{ role: "user", content: "hi" }]);

    expect(text).toBe("友誼大橋現在較慢。");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://llm.example.com/v1/chat/completions");
    expect(JSON.parse(String(init.body)).model).toBe("test-model");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-key",
    );
  });

  it("refuses to call the provider without an API key", async () => {
    vi.stubEnv("ASSISTANT_API_KEY", "");

    await expect(callAssistantProvider([])).rejects.toThrow("assistant_unconfigured");
  });
});

describe("assistant route", () => {
  it("returns 503 while the assistant is not configured", async () => {
    vi.stubEnv("ASSISTANT_API_KEY", "");

    const response = await POST(
      new Request("http://localhost/api/v1/assistant", {
        method: "POST",
        body: JSON.stringify({ question: "How is traffic?", locale: "en" }),
      }),
    );

    expect(response.status).toBe(503);
  });

  it("rejects payloads that fail the request schema", async () => {
    vi.stubEnv("ASSISTANT_API_KEY", "test-key");
    vi.stubEnv("RATE_LIMIT_DISABLED", "true");

    const response = await POST(
      new Request("http://localhost/api/v1/assistant", {
        method: "POST",
        body: JSON.stringify({ question: "", locale: "en" }),
      }),
    );

    expect(response.status).toBe(400);
  });
});


it("gives the provider Macau publication dates and practical next steps", () => {
  const messages = buildAssistantMessages("最新公告？", "zh-Hant", {
    ...snapshot, notices: [{ title: "恢復通車", category: "general", publishedAt: "2026-11-10T16:00:00.000Z" }],
  });
  expect(messages[1].content).toContain('"publishedAt":"2026-11-11"');
  expect(messages[0].content).toContain("Do not end with a quiz");
});


it("does not wait on the remote LRT network for a news question", async () => {
  const read = vi.spyOn(cache, "readSource").mockResolvedValue(null);
  const { snapshot: result } = await buildLearningSnapshot("zh-Hant", { question: "最新交通公告何時發布？" });
  expect(read.mock.calls.some(([source]) => source.id === "lrt-network")).toBe(false);
  expect(read.mock.calls.some(([source]) => source.id === "official-news")).toBe(true);
  expect(result.lrt).toBeNull();
});

it("still reads the LRT network when a rider asks about a line", async () => {
  const read = vi.spyOn(cache, "readSource").mockResolvedValue(null);
  await buildLearningSnapshot("zh-Hant", { question: "石排灣線有幾多個站？" });
  expect(read.mock.calls.some(([source]) => source.id === "lrt-network")).toBe(true);
});
