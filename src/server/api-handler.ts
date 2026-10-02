import "server-only";
import { after } from "next/server";
import { sourceEnabled } from "@/lib/config";
import type { ApiEnvelope } from "@/lib/types";
import { consumeRateLimit, readSource } from "@/server/cache";
import { sources, type SourceName } from "@/server/sources";
import type { SourceDefinition } from "@/server/source";

function requestIdentity(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return (
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function headers(ttlSeconds: number, staleTtlSeconds: number): HeadersInit {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": `public, max-age=${ttlSeconds}, stale-while-revalidate=${Math.min(staleTtlSeconds, 300)}`,
  };
}

export async function handleSource<T>(
  source: SourceDefinition<T>,
  request: Request,
): Promise<Response> {
  if (!sourceEnabled(source.envKey)) {
    return Response.json(
      {
        error: "source_disabled",
        message: `${source.name} is disabled by configuration.`,
      },
      { status: 503 },
    );
  }

  const rateLimit = await consumeRateLimit(requestIdentity(request));
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "rate_limited", message: "Too many requests." },
      {
        status: 429,
        headers: {
          "Retry-After": "60",
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  const read = await readSource(source);
  if (!read) {
    return Response.json(
      {
        error: "source_unavailable",
        message: `${source.name} is currently unavailable.`,
        source: { id: source.id, name: source.name, url: source.url },
      },
      { status: 503 },
    );
  }

  if (read.refresh) {
    after(read.refresh);
  }

  const body: ApiEnvelope<T> = {
    data: read.result.data,
    meta: {
      generatedAt: new Date().toISOString(),
      updatedAt: read.result.updatedAt,
      stale: read.result.stale,
      ttlSeconds: read.result.ttlSeconds,
      source: read.result.attribution,
    },
  };

  return Response.json(body, {
    headers: headers(source.ttlSeconds, source.staleTtlSeconds),
  });
}

export function handleNamedSource(name: SourceName, request: Request): Promise<Response> {
  return handleSource(
    sources[name] as unknown as SourceDefinition<unknown>,
    request,
  );
}
