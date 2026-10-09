import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/assistant/route";
import {
  buildAssistantMessages,
  callAssistantProvider,
  findMentionedSegments,
  looksBusRelated,
  matchNamedRoutes,
  type LearningSnapshot,
} from "@/server/sources/assistant";
import type { BusRoute, RoadCollection } from "@/lib/types";

afterEach(() => {
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
};

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
