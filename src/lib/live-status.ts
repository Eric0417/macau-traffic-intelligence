import type { ResponseMeta } from "@/lib/types";

// At the end of every TTL the server answers with the last payload while it
// refreshes in the background. That one-cycle lag is normal for every source
// and is not something the delay banner should report. Show it only once the
// payload is older than the TTL plus this grace window, which means a refresh
// cycle did not complete.
const DELAY_GRACE_SECONDS = 8;

export function metaIsDelayed(meta: ResponseMeta | null, now = Date.now()): boolean {
  if (!meta) return false;

  const generatedAt = Date.parse(meta.generatedAt);
  const updatedAt = Date.parse(meta.updatedAt);
  if (!Number.isFinite(generatedAt) || !Number.isFinite(updatedAt)) return true;

  return Math.max(now, generatedAt) - updatedAt > (meta.ttlSeconds + DELAY_GRACE_SECONDS) * 1_000;
}
