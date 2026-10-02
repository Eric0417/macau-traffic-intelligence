import { describe, expect, it } from "vitest";
import { createDsatToken } from "@/server/dsat-token";

describe("createDsatToken", () => {
  it("matches the DSAT web client token layout", () => {
    const token = createDsatToken(
      { lang: "zh_tw", device: "web" },
      new Date("2026-10-02T15:37:00.000Z"),
    );

    expect(token).toBe("de1a2026920ca46510023f381e2f191f23378c576212");
  });
});
