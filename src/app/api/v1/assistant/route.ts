import { after } from "next/server";
import { ASSISTANT_DEFAULT_RATE_LIMIT } from "@/lib/config";
import { learningAssistantRequestSchema } from "@/lib/contracts";
import type { ApiEnvelope, LearningAssistantAnswer } from "@/lib/types";
import { requestIdentity } from "@/server/api-handler";
import { consumeRateLimit } from "@/server/cache";
import {
  askLearningAssistant,
  assistantConfigured,
  assistantModelName,
  assistantProviderOrigin,
} from "@/server/sources/assistant";

export async function POST(request: Request) {
  if (!assistantConfigured()) {
    return Response.json(
      {
        error: "assistant_unconfigured",
        message: "The AI assistant is not configured on this server.",
      },
      { status: 503 },
    );
  }

  const identity = requestIdentity(request);
  const globalLimit = await consumeRateLimit(identity);
  if (!globalLimit.allowed) {
    return Response.json(
      { error: "rate_limited", message: "Too many requests." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const assistantLimit = await consumeRateLimit(
    `assistant:${identity}`,
    Number(process.env.ASSISTANT_RATE_LIMIT_PER_MINUTE ?? ASSISTANT_DEFAULT_RATE_LIMIT),
  );
  if (!assistantLimit.allowed) {
    return Response.json(
      {
        error: "rate_limited",
        message: "The AI assistant rate limit was reached. Try again in a minute.",
      },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { error: "invalid_request", message: "The request body must be JSON." },
      { status: 400 },
    );
  }

  const parsed = learningAssistantRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const { answer, refreshes } = await askLearningAssistant(parsed.data);
    for (const refresh of refreshes) after(refresh);

    const body: ApiEnvelope<LearningAssistantAnswer> = {
      data: answer,
      meta: {
        generatedAt: new Date().toISOString(),
        updatedAt: answer.snapshotAt,
        stale: false,
        ttlSeconds: 0,
        source: {
          id: "assistant",
          name: `AI assistant (${assistantModelName()})`,
          url: assistantProviderOrigin(),
          text: "Answer grounded in the platform's normalized live data snapshot",
        },
      },
    };

    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      {
        error: "assistant_unavailable",
        message: "The AI assistant is temporarily unavailable.",
      },
      { status: 502 },
    );
  }
}
