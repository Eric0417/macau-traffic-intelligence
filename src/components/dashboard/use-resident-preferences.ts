"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";

const favoriteSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("bus"),
    routeCode: z.string(),
    direction: z.union([z.literal(0), z.literal(1)]),
    stopKey: z.string().optional(),
    stopName: z.string().optional(),
  }),
  z.object({ kind: z.literal("parking"), id: z.string() }),
]);
const preferencesSchema = z.object({
  theme: z.enum(["light", "dark"]),
  favorites: z.array(favoriteSchema).max(100),
});
export type Favorite = z.infer<typeof favoriteSchema>;
const storageKey = "macau-traffic:resident-v1";

export function favoriteId(favorite: Favorite): string {
  return favorite.kind === "parking"
    ? `parking:${favorite.id}`
    : `bus:${favorite.routeCode}:${favorite.direction}:${favorite.stopKey ?? ""}`;
}

type Preferences = z.infer<typeof preferencesSchema>;
const initial: Preferences = { theme: "light", favorites: [] };
let snapshot = initial;
let lastStored: string | null | undefined;
const listeners = new Set<() => void>();

function getSnapshot(): Preferences {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored !== lastStored) {
      lastStored = stored;
      const result = preferencesSchema.safeParse(JSON.parse(stored ?? "null"));
      snapshot = result.success
        ? result.data
        : {
            ...initial,
            theme: matchMedia("(prefers-color-scheme: dark)").matches
              ? "dark"
              : "light",
          };
    }
  } catch {
    /* Retain in-memory preferences when storage is unavailable. */
  }
  return snapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function useResidentPreferences() {
  const preferences = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => initial,
  );
  const update = (next: Preferences) => {
    snapshot = next;
    const serialized = JSON.stringify(next);
    try {
      localStorage.setItem(storageKey, serialized);
      lastStored = serialized;
    } catch {
      /* In-memory preferences still work. */
    }
    listeners.forEach((listener) => listener());
  };
  const isSaved = (favorite: Favorite) =>
    preferences.favorites.some(
      (item) => favoriteId(item) === favoriteId(favorite),
    );
  return {
    ...preferences,
    isSaved,
    setTheme: (theme: "light" | "dark") => update({ ...preferences, theme }),
    toggle: (favorite: Favorite) =>
      update({
        ...preferences,
        favorites: isSaved(favorite)
          ? preferences.favorites.filter(
              (item) => favoriteId(item) !== favoriteId(favorite),
            )
          : [...preferences.favorites.slice(-99), favorite],
      }),
  };
}
