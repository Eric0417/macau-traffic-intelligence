import { afterEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/assistant/transcribe/route";
import { encodeVoiceWav, VOICE_MAX_BYTES, VOICE_SAMPLE_RATE } from "@/lib/voice-audio";

function setup(provider: typeof fetch) {
  vi.stubEnv("SOURCE_ASSISTANT_ENABLED", "true");
  vi.stubEnv("ASSISTANT_BASE_URL", "https://api.deepseek.com/v1");
  vi.stubEnv("ASSISTANT_API_KEY", "fixture-key");
  vi.stubEnv("RATE_LIMIT_DISABLED", "true");
  vi.stubGlobal("fetch", provider);
}

function request(audio = encodeVoiceWav(new Float32Array(4000))) {
  return new Request("http://localhost/api/v1/assistant/transcribe", {
    method: "POST", headers: { "Content-Type": "audio/wav" }, body: audio,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("sends a PCM WAV to the DeepSeek adapter and only returns the normalized transcript", async () => {
  const provider = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
    request_id: "provider-id", text: "  由關閘去媽閣廟。 ", duration_ms: 250,
  }));
  setup(provider);
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = await response.json();
  expect(body.data).toEqual({ text: "由關閘去媽閣廟。" });
  expect(JSON.stringify(body)).not.toMatch(/provider-id|duration_ms/);
  const [url, options] = provider.mock.calls[0];
  expect(url).toBe("https://api.deepseek.com/v1/tools/asr");
  expect(new Headers(options?.headers).get("authorization")).toBe("Bearer fixture-key");
  const file = (options?.body as FormData).get("file") as File;
  expect(file.type).toBe("audio/wav");
  const wav = new DataView(await file.arrayBuffer());
  expect(wav.getUint32(24, true)).toBe(VOICE_SAMPLE_RATE);
  expect(wav.getUint32(40, true)).toBe(8_000);
});

it("rejects malformed and oversized audio before contacting the provider", async () => {
  const provider = vi.fn<typeof fetch>();
  setup(provider);
  expect((await POST(request(new ArrayBuffer(64)))).status).toBe(400);
  expect((await POST(request(new ArrayBuffer(VOICE_MAX_BYTES + 2)))).status).toBe(413);
  expect(provider).not.toHaveBeenCalled();
});

it("keeps another chat provider's key out of the DeepSeek request", async () => {
  const provider = vi.fn<typeof fetch>();
  setup(provider);
  vi.stubEnv("ASSISTANT_BASE_URL", "https://another-provider.example/v1");
  expect((await POST(request())).status).toBe(503);
  expect(provider).not.toHaveBeenCalled();
});

it("returns a retryable error without forwarding DeepSeek's response body", async () => {
  setup(vi.fn<typeof fetch>().mockResolvedValue(Response.json({ private: "upstream diagnostic" }, { status: 429 })));
  const response = await POST(request());
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("60");
  expect(await response.json()).toMatchObject({ error: "rate_limited" });
});
