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
  const failuresRef = useRef(0);

  const load = useCallback(
    async (background = false): Promise<boolean> => {
      if (!enabled) return false;
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
        failuresRef.current = 0;
        setState({ data: body.data, meta: body.meta, error: null, loading: false });
        return true;
      } catch (error) {
        if (controller.signal.aborted) return false;
        failuresRef.current += 1;
        setState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : "Request failed",
          loading: false,
        }));
        return false;
      }
    },
    [enabled, url],
  );

  useEffect(() => {
    // A different URL is a different resource. Clear the previous payload so
    // a route switch cannot show the old route's arrivals while it reloads.
    setState({ data: null, meta: null, error: null, loading: enabled });
    failuresRef.current = 0;
    let cancelled = false;
    let timer: number | undefined;

    // Poll on a recursive timer so failed sources back off instead of being
    // hammered at the base interval. Jitter keeps clients from syncing up.
    const schedule = () => {
      if (cancelled) return;
      const failures = failuresRef.current;
      const backoff = failures === 0 ? 1 : Math.min(2 ** failures, 8);
      const jitter = 0.9 + Math.random() * 0.2;
      const cap = Math.max(intervalMs, 300_000);
      const delay = Math.min(intervalMs * backoff * jitter, cap);
      timer = window.setTimeout(() => {
        timer = undefined;
        if (document.visibilityState !== "visible") {
          schedule();
          return;
        }
        void load(true).finally(() => schedule());
      }, delay);
    };

    void load().finally(() => schedule());

    const onVisibility = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      controllerRef.current?.abort();
    };
  }, [enabled, intervalMs, load]);

  return { ...state, refresh: () => load(true) };
}
