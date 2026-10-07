import { APP_NAME_EN, CACHE_PREFIX } from "@/lib/config";
import { cacheBackendType, getCacheBackend } from "@/server/cache";
import { sources } from "@/server/sources";

export async function GET() {
  const backend = getCacheBackend();
  const failures = Object.fromEntries(
    await Promise.all(
      Object.values(sources).map(async (source) => [
        source.id,
        await backend.failureCount(`${CACHE_PREFIX}:failure:${source.id}`),
      ]),
    ),
  );

  return Response.json(
    {
      status: "ok",
      service: APP_NAME_EN,
      cache: cacheBackendType(),
      failures,
      time: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
