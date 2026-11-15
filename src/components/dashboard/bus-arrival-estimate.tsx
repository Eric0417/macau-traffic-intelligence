"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLanguage } from "@/components/language-provider";
import { usableArrivalEstimate, usableArrivalStatus } from "@/lib/bus-prediction";
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
  const status = disabled ? null : usableArrivalStatus(stop, now);
  if (!estimate && !status) return <>{fallback}</>;
  if (status) {
    const label = status.state === "near-stop"
      ? locale === "en" ? "Near stop · stationary" : locale === "zh-Hans" ? "站点附近停留中" : "站點附近停留中"
      : locale === "en" ? "Updating arrival" : locale === "zh-Hans" ? "到站时间更新中" : "到站時間更新中";
    return <span className="bus-arrival-estimate"><span>{label}</span><small>{locale === "en" ? "Minutes unavailable" : locale === "zh-Hans" ? "暂未能估算分钟" : "暫未能估算分鐘"}</small></span>;
  }
  if (!estimate) return <>{fallback}</>;
  const label = locale === "en" ? `About ${estimate.minutes} min` : `約 ${estimate.minutes} ${locale === "zh-Hans" ? "分钟" : "分鐘"}`;
  const source = locale === "en" ? "System estimate" : locale === "zh-Hans" ? "系统估算" : "系統估算";
  const next = estimate.nextBus ? locale === "en" ? "Updated bus · " : locale === "zh-Hans" ? "班次已更新 · " : "班次已更新 · " : "";
  return <span className="bus-arrival-estimate"><span>{label}</span><small>{next}{source}</small></span>;
}
