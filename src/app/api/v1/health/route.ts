import { APP_NAME_EN } from "@/lib/config";
import { cacheBackendType } from "@/server/cache";

export function GET() {
  return Response.json(
    {
      status: "ok",
      service: APP_NAME_EN,
      cache: cacheBackendType(),
      time: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
