import "server-only";
import { z } from "zod";
import { assistantConfigured, assistantProviderOrigin } from "./assistant";

const DEEPSEEK_ORIGIN = "https://api.deepseek.com";
export const voiceAttribution = {
  id: "assistant-transcription",
  name: "DeepSeek speech to text",
  url: "https://api-docs.deepseek.com/guides/asr/",
  text: "Editable transcript of the submitted recording",
};

const transcriptSchema = z.object({ text: z.string().trim() });

export function transcriptionConfigured(): boolean {
  return assistantConfigured() && assistantProviderOrigin() === DEEPSEEK_ORIGIN;
}

export async function transcribeRecording(audio: Uint8Array<ArrayBuffer>, signal: AbortSignal) {
  const file = new FormData();
  file.set("file", new Blob([audio], { type: "audio/wav" }), "recording.wav");
  const response = await fetch(`${DEEPSEEK_ORIGIN}/v1/tools/asr`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.ASSISTANT_API_KEY}` },
    body: file,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]),
  });
  if (response.status === 429) return { error: "rate_limited" } as const;
  if (!response.ok) throw new Error("transcription_unavailable");
  return transcriptSchema.parse(await response.json());
}
