import "server-only";
import type { AssistantPlace } from "@/lib/assistant-journey";
import { BUS_JOURNEY_ACCESS_METERS, planBusJourneys, type BusJourney, type BusNetwork } from "@/lib/bus-journey";
import { createWalkingRouter, type WalkingNetwork } from "@/lib/walking-network";
import { distanceMeters } from "@/lib/resident-tools";
import type { Locale } from "@/lib/types";
import { readSource, type SourceRead } from "@/server/cache";
import { busDiversionSource } from "./bus";

export async function journeyCandidates(bus: BusNetwork, walking: WalkingNetwork, origin: AssistantPlace, destination: AssistantPlace, locale: Locale, departureMinute?: number, router?: ReturnType<typeof createWalkingRouter>, checkCurrentSuspensions = departureMinute !== undefined, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const started = performance.now();
  router ??= createWalkingRouter(walking);
  const text = (hant: string, hans: string, en: string) => locale === "en" ? en : locale === "zh-Hans" ? hans : hant;
  const refreshes: Array<() => Promise<void>> = [];
  const access = router(origin.coordinates), egress = router(destination.coordinates, true);
  const walkingMs = Math.round(performance.now() - started);
  let searchMs = 0, stopChecksMs = 0;
  const stops = [...new Map(bus.routes.flatMap(r => r.stops).map(s => [s.stationCode, s])).values()];
  const accessMapped = stops.some(s => distanceMeters(s.coordinates, origin.coordinates) <= BUS_JOURNEY_ACCESS_METERS && access(s.coordinates));
  const egressMapped = stops.some(s => distanceMeters(s.coordinates, destination.coordinates) <= BUS_JOURNEY_ACCESS_METERS && egress(s.coordinates));
  const unavailableStops = new Map<string, Set<string>>();
  const plan = () => {
    const start = performance.now();
    const plans = planBusJourneys(bus, origin, destination, {
      departureMinute, unavailableStops, walking: { access: accessMapped ? access : undefined, egress: egressMapped ? egress : undefined },
    });
    searchMs += performance.now() - start;
    return plans;
  };
  let candidates = plan();
  const checks: Array<{ name: string; read: SourceRead<string[]> | null }> = [];
  // Refill from the network after exclusions, then check newly exposed routes.
  while (checkCurrentSuspensions) {
    const names = [...new Set(candidates.flatMap(c => c.legs.map(l => l.routeName)))].filter(name => !unavailableStops.has(name));
    if (!names.length) break;
    const checking = performance.now();
    const reads = await Promise.all(names.map(async name => ({ name, read: await readSource(busDiversionSource(name)) })));
    stopChecksMs += performance.now() - checking;
    signal?.throwIfAborted();
    for (const { name, read } of reads) {
      checks.push({ name, read });
      unavailableStops.set(name, new Set(read?.result.data ?? []));
      if (read?.refresh) refreshes.push(read.refresh);
    }
    if (reads.some(({ read }) => read?.result.data.length)) candidates = plan();
  }
  const walk = access(destination.coordinates);
  if (walk) candidates.push({ id: "walk", legs: [], totalStops: 0, accessMeters: walk.meters, egressMeters: 0, transferMeters: 0, walking: { direct: walk } });
  const straightDistance = distanceMeters(origin.coordinates, destination.coordinates);
  const taxiAlternative = (walk?.meters ?? straightDistance) >= 3_000 ||
    (straightDistance > 1_000 && !candidates.some(c => c.legs.length))
    ? text(`可以考慮由${origin.name}乘的士前往${destination.name}。請喺合法安全嘅位置上落車；目前未有即時車輛、行車路線、車費或車程資料。`,
      `可以考虑从${origin.name}乘的士前往${destination.name}。请在合法安全的位置上下车；目前没有实时车辆、行车路线、车费或车程资料。`,
      `Consider a taxi from ${origin.name} to ${destination.name}. Use a legal, safe pickup and drop-off point. Vehicle availability, driving route, fare and duration are not available.`)
    : undefined;
  const warnings = [text("路線及步行資料有指定日期；未核實嘅服務時間、步行封路同候車時間不作保證，出發前請查看各程停站狀態。", "路线及步行资料有指定日期；未核实的服务时间、步行封路和候车时间不作保证，出发前请查看各程停站状态。", "Routes and walking paths are dated. Unverified hours, path closures and waiting times are unknown; check each leg before departure.")];
  if (!accessMapped || !egressMapped) warnings.push(text("部分起終點未能對應步行網絡，接駁距離為直線估計；請核對現場入口及過路設施。", "部分起终点未能对应步行网络，接驳距离为直线估计；请核对现场入口和过路设施。", "Some endpoints cannot be matched to walking paths. Access distances there are straight-line estimates; check entrances and crossings."));
  if (checks.some(({ read }) => !read || read.result.stale)) warnings.push(text("部分停站調整資料未能即時核實。", "部分停站调整资料未能即时核实。", "Some stop suspension checks are missing or delayed."));
  if (bus.coverage.missingRoutes.length) warnings.push(text("路線資料未涵蓋所有巴士服務。", "路线资料未涵盖所有巴士服务。", "The route dataset does not cover every bus service."));
  if (!candidates.some(c => c.legs.length)) warnings.push(text("呢次搜尋未搵到符合步行及轉乘限制嘅巴士方案，唔代表冇巴士服務。", "此次搜索未找到符合步行和换乘限制的巴士方案，不代表没有巴士服务。", "This search found no bus option within its walking and transfer limits; it does not establish that no bus service exists."));
  if (process.env.NODE_ENV === "production") console.info(JSON.stringify({ event: "journey_candidates_timing", walkingMs,
    searchMs: Math.round(searchMs), stopChecksMs: Math.round(stopChecksMs), totalMs: Math.round(performance.now() - started) }));
  return { candidates, warnings, checks, refreshes, taxiAlternative };
}

export function journeyEvidence(journey: BusJourney) {
  const { id, legs, totalStops, accessMeters, egressMeters, transferMeters, walking } = journey;
  const distance = (meters: number, mapped: boolean) => ({ meters, basis: meters === 0 ? "none" : mapped ? "dated_mapped_path" : "straight_line_estimate" });
  return { id, legs, totalStops, walkingMeters: accessMeters + egressMeters + transferMeters,
    accessMapped: Boolean(walking?.access || walking?.direct), egressMapped: Boolean(walking?.egress || walking?.direct),
    access: distance(accessMeters, Boolean(walking?.access || walking?.direct)),
    egress: distance(egressMeters, Boolean(walking?.egress || walking?.direct)),
    transfers: Math.max(0, legs.length - 1), mode: legs.length ? "bus" : "walk" };
}
