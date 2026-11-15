import { z } from "zod";
import { handleSource } from "@/server/api-handler";
import { busEtaSource } from "@/server/sources/bus";

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
  const source = busEtaSource(normalizedCode, direction);

  return handleSource(source, request);
}
