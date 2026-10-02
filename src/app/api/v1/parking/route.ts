import { handleNamedSource } from "@/server/api-handler";

export function GET(request: Request) {
  return handleNamedSource("parking", request);
}
