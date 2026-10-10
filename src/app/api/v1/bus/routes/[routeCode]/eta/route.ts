import { z } from "zod";
import type { SourceDefinition } from "@/server/source";
import { handleSource } from "@/server/api-handler";
import { loadBusEta } from "@/server/sources/bus";
import { busEtaSchema } from "@/lib/contracts";

const querySchema = z.object({
  direction: z.coerce.number().int().min(0).max(1).default(0),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ routeCode: string }> },
) {
  const { routeCode } = await context.params;
  const parsed = querySchema.safeParse({
    direction: new URL(request.url).searchParams.get("direction") ?? 0,
  });

  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const normalizedCode = routeCode.toUpperCase();
  const direction = parsed.data.direction as 0 | 1;
  const source: SourceDefinition<Awaited<ReturnType<typeof loadBusEta>>> = {
    id: `bus-eta-${normalizedCode}-${direction}`,
    name: `巴士 ${normalizedCode} 實時位置`,
    url: "https://bis.dsat.gov.mo:37812/macauweb/",
    attribution: "交通事務局巴士報站公開實時資料",
    envKey: "SOURCE_BUS_ENABLED",
    ttlSeconds: 5,
    staleTtlSeconds: 60,
    schema: busEtaSchema,
    load: () => loadBusEta(normalizedCode, direction),
  };

  return handleSource(source, request);
}
