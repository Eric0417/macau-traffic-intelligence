import { ASSISTANT_DEFAULT_RATE_LIMIT } from "@/lib/config";
import type { ApiEnvelope } from "@/lib/types";
import { isVoiceWav, VOICE_MAX_BYTES } from "@/lib/voice-audio";
import { requestIdentity } from "@/server/api-handler";
import { consumeRateLimit } from "@/server/cache";
import { transcribeRecording, transcriptionConfigured, voiceAttribution } from "@/server/sources/voice-transcription";

const noStore = { "Cache-Control": "no-store" };

function fail(error: string, status: number) {
  return Response.json({ error }, {
    status,
    headers: status === 429 ? { ...noStore, "Retry-After": "60" } : noStore,
  });
}

async function readVoiceWav(request: Request) {
  if (Number(request.headers.get("content-length")) > VOICE_MAX_BYTES) return "too_large";
  if (!request.body) return null;
  const reader = request.body.getReader();
  const bytes = new Uint8Array(VOICE_MAX_BYTES);
  let offset = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return bytes.subarray(0, offset);
      if (offset + value.length > VOICE_MAX_BYTES) {
        await reader.cancel();
        return "too_large";
      }
      bytes.set(value, offset);
      offset += value.length;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  if (!transcriptionConfigured()) return fail("transcription_unconfigured", 503);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "audio/wav") {
    return fail("invalid_audio", 415);
  }
  const identity = requestIdentity(request);
  const globalLimit = await consumeRateLimit(identity);
  if (!globalLimit.allowed) return fail("rate_limited", 429);
  const assistantLimit = await consumeRateLimit(
    `assistant:${identity}`,
    Number(process.env.ASSISTANT_RATE_LIMIT_PER_MINUTE ?? ASSISTANT_DEFAULT_RATE_LIMIT),
  );
  if (!assistantLimit.allowed) return fail("rate_limited", 429);

  const audio = await readVoiceWav(request).catch(() => null);
  if (audio === "too_large") return fail("audio_too_large", 413);
  if (!audio || !isVoiceWav(audio)) return fail("invalid_audio", 400);

  try {
    const transcript = await transcribeRecording(audio, request.signal);
    if ("error" in transcript) return fail(transcript.error, 429);
    if (!transcript.text) return fail("no_speech", 422);
    const now = new Date().toISOString();
    const body: ApiEnvelope<{ text: string }> = {
      data: transcript,
      meta: { generatedAt: now, updatedAt: now, stale: false, ttlSeconds: 0, source: voiceAttribution },
    };
    return Response.json(body, { headers: noStore });
  } catch {
    return fail("transcription_unavailable", 502);
  }
}
