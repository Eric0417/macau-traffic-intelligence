import "server-only";
import type { AssistantPlace } from "@/lib/assistant-journey";
import { BUS_JOURNEY_ACCESS_METERS, planBusJourneys, type BusNetwork } from "@/lib/bus-journey";
import { createWalkingRouter, type WalkingNetwork } from "@/lib/walking-network";
import { distanceMeters } from "@/lib/resident-tools";
import type { Locale } from "@/lib/types";
import { readSource } from "@/server/cache";
import { busDiversionSource } from "./bus";

export async function journeyCandidates(bus: BusNetwork, walking: WalkingNetwork, origin: AssistantPlace, destination: AssistantPlace, locale: Locale, departureMinute?: number, router = createWalkingRouter(walking), checkCurrentSuspensions = departureMinute !== undefined) {
  const text = (hant: string, hans: string, en: string) => locale === "en" ? en : locale === "zh-Hans" ? hans : hant;
  const refreshes: Array<() => Promise<void>> = [];
  const access = router(origin.coordinates), egress = router(destination.coordinates, true);
  const stops = [...new Map(bus.routes.flatMap(r => r.stops).map(s => [s.stationCode, s])).values()];
  const accessMapped = stops.some(s => distanceMeters(s.coordinates, origin.coordinates) <= BUS_JOURNEY_ACCESS_METERS && access(s.coordinates));
  const egressMapped = stops.some(s => distanceMeters(s.coordinates, destination.coordinates) <= BUS_JOURNEY_ACCESS_METERS && egress(s.coordinates));
  let candidates = planBusJourneys(bus, { coordinates: origin.coordinates }, { coordinates: destination.coordinates }, {
    departureMinute, walking: { access: accessMapped ? access : undefined, egress: egressMapped ? egress : undefined },
  });
  const routeNames = checkCurrentSuspensions ? [...new Set(candidates.flatMap(c => c.legs.map(l => l.routeName)))] : [];
  const checks = await Promise.all(routeNames.map(async name => ({ name, read: await readSource(busDiversionSource(name)) })));
  for (const { read } of checks) if (read?.refresh) refreshes.push(read.refresh);
  candidates = candidates.filter(c => c.legs.every(l => {
    const codes = checks.find(c => c.name === l.routeName)?.read?.result.data ?? [];
    return !codes.includes(l.from.stationCode) && !codes.includes(l.to.stationCode);
  }));
  const walk = access(destination.coordinates);
  if (walk) candidates.push({ id: "walk", legs: [], totalStops: 0, accessMeters: walk.meters, egressMeters: 0, transferMeters: 0, walking: { direct: walk } });
  const warnings = [text("路線及步行資料有指定日期；未核實嘅服務時間、步行封路同候車時間不作保證，出發前請查看各程停站狀態。", "路线及步行资料有指定日期；未核实的服务时间、步行封路和候车时间不作保证，出发前请查看各程停站状态。", "Routes and walking paths are dated. Unverified hours, path closures and waiting times are unknown; check each leg before departure.")];
  if (!accessMapped || !egressMapped) warnings.push(text("部分起終點未能對應步行網絡，接駁距離為直線估計；請核對現場入口及過路設施。", "部分起终点未能对应步行网络，接驳距离为直线估计；请核对现场入口和过路设施。", "Some endpoints cannot be matched to walking paths. Access distances there are straight-line estimates; check entrances and crossings."));
  if (checks.some(({ read }) => !read || read.result.stale)) warnings.push(text("部分停站調整資料未能即時核實。", "部分停站调整资料未能即时核实。", "Some stop suspension checks are missing or delayed."));
  if (bus.coverage.missingRoutes.length) warnings.push(text("路線資料未涵蓋所有巴士服務。", "路线资料未涵盖所有巴士服务。", "The route dataset does not cover every bus service."));
  return { candidates, warnings, checks, refreshes };
}
