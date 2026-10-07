import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/v1/health/route";

describe("health route", () => {
  it("reports the cache backend and per-source failure counts", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.cache).toBe("memory");
    expect(body.failures["lrt-network"]).toBe(0);
    expect(Object.keys(body.failures)).toContain("bus-routes");
  });
});
