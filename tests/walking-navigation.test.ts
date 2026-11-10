import { describe, expect, it } from "vitest";
import { walkingNavigationUrl } from "@/lib/walking-navigation";

describe("user-opened walking directions", () => {
  it("uses walking mode and latitude-longitude order for both endpoints", () => {
    const url = new URL(walkingNavigationUrl([113.54, 22.19], [113.55, 22.20]));
    expect(url.origin).toBe("https://www.google.com");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("travelmode")).toBe("walking");
    expect(url.searchParams.get("origin")).toBe("22.19,113.54");
    expect(url.searchParams.get("destination")).toBe("22.2,113.55");
  });
});
