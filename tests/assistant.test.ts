import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/assistant/route";
import {
  buildAssistantMessages,
  callAssistantProvider,
  type LearningSnapshot,
} from "@/server/sources/assistant";

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
  },
  parking: [],
  borders: [],
  notices: [],
  lrtNotices: [],
  busRoute: null,
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
