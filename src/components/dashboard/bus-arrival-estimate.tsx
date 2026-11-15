"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLanguage } from "@/components/language-provider";
import { usableArrivalEstimate } from "@/lib/bus-prediction";
import type { BusEtaStop } from "@/lib/types";

export function BusArrivalEstimate({ stop, disabled, fallback }: {
  stop: BusEtaStop; disabled?: boolean; fallback?: ReactNode;
}) {
  const { locale } = useLanguage();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 2000);
    return () => window.clearInterval(timer);
  }, []);
  const estimate = disabled ? null : usableArrivalEstimate(stop, now);
  if (!estimate) return <>{fallback}</>;
  const label = locale === "en" ? `About ${estimate.minutes} min` : `約 ${estimate.minutes} ${locale === "zh-Hans" ? "分钟" : "分鐘"}`;
  const source = locale === "en" ? "System estimate" : locale === "zh-Hans" ? "系统估算" : "系統估算";
  return <span className="bus-arrival-estimate"><span>{label}</span><small>{source}</small></span>;
}
