"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { DEFAULT_LOCALE } from "@/lib/config";
import { translate, type MessageKey } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);
const listeners = new Set<() => void>();
let currentLocale: Locale = DEFAULT_LOCALE;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getLocaleSnapshot(): Locale {
  if (typeof window === "undefined") return currentLocale;
  const stored = window.localStorage.getItem("macau-traffic:locale");
  if (stored === "zh-Hant" || stored === "zh-Hans" || stored === "en") {
    currentLocale = stored;
  }
  return currentLocale;
}

function setGlobalLocale(locale: Locale) {
  currentLocale = locale;
  if (typeof window !== "undefined") {
    window.localStorage.setItem("macau-traffic:locale", locale);
  }
  listeners.forEach((listener) => listener());
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(
    subscribe,
    getLocaleSnapshot,
    () => DEFAULT_LOCALE,
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      setLocale(next) {
        setGlobalLocale(next);
      },
      t: (key) => translate(locale, key),
    }),
    [locale],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
