import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { readSource } from "@/server/cache";
import type { SourceDefinition } from "@/server/source";

beforeEach(() => {
  globalThis.__macauTrafficCacheBackend = undefined;
});

describe("source cache", () => {
  it("coalesces a successful source read into shared cache", async () => {
    const load = vi.fn().mockResolvedValue({ value: 1 });
    const source: SourceDefinition<{ value: number }> = {
      id: `test-${Math.random()}`,
      name: "Test",
      url: "https://example.com",
      attribution: "Test source",
      envKey: "TEST_SOURCE_ENABLED",
      ttlSeconds: 60,
      staleTtlSeconds: 120,
      schema: z.object({ value: z.number() }),
      load,
    };

    const first = await readSource(source);
    const second = await readSource(source);

    expect(first?.result.data.value).toBe(1);
    expect(second?.result.data.value).toBe(1);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("returns stale data when refresh fails", async () => {
    let shouldFail = false;
    const source: SourceDefinition<{ value: number }> = {
      id: `test-stale-${Math.random()}`,
      name: "Test",
      url: "https://example.com",
      attribution: "Test source",
      envKey: "TEST_SOURCE_ENABLED",
      ttlSeconds: -1,
      staleTtlSeconds: 120,
      schema: z.object({ value: z.number() }),
      load: async () => {
        if (shouldFail) throw new Error("upstream down");
        return { value: 2 };
      },
    };

    await readSource(source);
    shouldFail = true;
    const stale = await readSource(source);
    await stale?.refresh?.();
    const afterFailure = await readSource(source);

    expect(stale?.result.stale).toBe(true);
    expect(afterFailure?.result.data.value).toBe(2);
    expect(afterFailure?.result.stale).toBe(true);
  });
});
