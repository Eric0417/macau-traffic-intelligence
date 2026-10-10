import { describe, expect, it } from "vitest";
import { metaIsDelayed } from "@/lib/live-status";
import type { ResponseMeta } from "@/lib/types";

function meta(overrides: Partial<ResponseMeta> = {}): ResponseMeta {
  return {
    generatedAt: "2026-10-11T02:00:20.000Z",
    updatedAt: "2026-10-11T02:00:20.000Z",
    stale: true,
    ttlSeconds: 2,
    source: { id: "bus", name: "Bus", url: "https://example.com", text: "Bus" },
    ...overrides,
  };
}

describe("live status", () => {
  it("keeps the delay indicator off for the one-cycle cache lag", () => {
    expect(metaIsDelayed(meta())).toBe(false);
    expect(metaIsDelayed(meta({ updatedAt: "2026-10-11T02:00:16.000Z" }))).toBe(false);
    expect(metaIsDelayed(meta({ stale: false }))).toBe(false);
    expect(metaIsDelayed(null)).toBe(false);
  });

  it("flags a payload whose refresh cycle did not complete", () => {
    expect(metaIsDelayed(meta({ updatedAt: "2026-10-11T02:00:05.000Z" }))).toBe(true);
    expect(metaIsDelayed(meta({ generatedAt: "not-a-date" }))).toBe(true);
  });
});
