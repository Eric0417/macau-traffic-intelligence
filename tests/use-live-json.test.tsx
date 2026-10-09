// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLiveJson } from "@/components/use-live-json";

function Probe({ url }: { url: string }) {
  const state = useLiveJson<{ value: string }>(url, 60_000);
  return (
    <span data-testid="value">
      {state.data?.value ?? (state.loading ? "loading" : "empty")}
    </span>
  );
}

function envelope(value: string) {
  return {
    data: { value },
    meta: {
      generatedAt: "2026-10-07T00:00:00.000Z",
      updatedAt: "2026-10-07T00:00:00.000Z",
      stale: false,
      ttlSeconds: 60,
      source: {
        id: "test",
        name: "Test source",
        url: "https://example.com/",
        text: "Test source",
      },
    },
  };
}

describe("useLiveJson", () => {
  it("clears the previous payload when the url changes", async () => {
    let resolveSecond: (() => void) | undefined;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      if (String(input).endsWith("/a")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => envelope("A"),
        } as Response);
      }
      return new Promise<Response>((resolve) => {
        resolveSecond = () =>
          resolve({
            ok: true,
            status: 200,
            json: async () => envelope("B"),
          } as Response);
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { rerender } = render(<Probe url="/a" />);
      await waitFor(() => expect(screen.getByTestId("value").textContent).toBe("A"));
      expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store" });

      rerender(<Probe url="/b" />);
      await waitFor(() => expect(screen.getByTestId("value").textContent).not.toBe("A"));
      expect(screen.getByTestId("value").textContent).toBe("loading");
      resolveSecond?.();
      await waitFor(() => expect(screen.getByTestId("value").textContent).toBe("B"));
    } finally {
      cleanup();
      vi.unstubAllGlobals();
    }
  });

  it("backs off after a failed poll instead of retrying at the base interval", async () => {
    vi.useFakeTimers();
    const attempts: number[] = [];
    const fetchMock = vi.fn(() => {
      attempts.push(Date.now());
      return Promise.reject(new Error("offline"));
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      render(<Probe url="/a" />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(attempts).toHaveLength(1);

      // The first retry waits two base intervals plus jitter.
      await act(async () => {
        await vi.advanceTimersToNextTimerAsync();
      });
      expect(attempts).toHaveLength(2);
      expect(attempts[1] - attempts[0]).toBeGreaterThanOrEqual(108_000);
      expect(attempts[1] - attempts[0]).toBeLessThanOrEqual(132_000);

      // The second retry waits four base intervals plus jitter.
      await act(async () => {
        await vi.advanceTimersToNextTimerAsync();
      });
      expect(attempts).toHaveLength(3);
      expect(attempts[2] - attempts[1]).toBeGreaterThanOrEqual(216_000);
      expect(attempts[2] - attempts[1]).toBeLessThanOrEqual(264_000);
    } finally {
      cleanup();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});
