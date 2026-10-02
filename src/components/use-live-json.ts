"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiEnvelope } from "@/lib/types";

export interface LiveJsonState<T> {
  data: T | null;
  meta: ApiEnvelope<T>["meta"] | null;
  error: string | null;
  loading: boolean;
}

export interface LiveJsonResult<T> extends LiveJsonState<T> {
  refresh: () => void;
}

export function useLiveJson<T>(
  url: string,
  intervalMs: number,
  enabled = true,
): LiveJsonResult<T> {
  const [state, setState] = useState<LiveJsonState<T>>({
    data: null,
    meta: null,
    error: null,
    loading: enabled,
  });
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (background = false) => {
      if (!enabled) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      if (!background) {
        setState((current) => ({ ...current, loading: current.data === null }));
      }

      try {
        const response = await fetch(url, { signal: controller.signal });
        const body = (await response.json()) as ApiEnvelope<T> | { message?: string };
        if (!response.ok || !("data" in body)) {
          throw new Error("message" in body ? body.message : `HTTP ${response.status}`);
        }
        setState({ data: body.data, meta: body.meta, error: null, loading: false });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : "Request failed",
          loading: false,
        }));
      }
    },
    [enabled, url],
  );

  useEffect(() => {
    void load();

    const tick = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    const timer = window.setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      controllerRef.current?.abort();
    };
  }, [intervalMs, load]);

  return { ...state, refresh: () => load(true) };
}
