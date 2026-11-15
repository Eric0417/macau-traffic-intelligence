import { expect, it } from "vitest";
import recording from "./fixtures/bus-route56-sequence.json";
import { predictBusArrivals } from "@/lib/bus-prediction";
import { busEtaSchema } from "@/lib/contracts";
import { advanceBusMotion, buildRoutePath, createBusMotion, type BusMotion } from "@/components/dashboard/bus-motion";
import type { BusEta } from "@/lib/types";

it("replays 40 route 56 reports without reversals or silent replacement of an uncertain bus", () => {
  let previous: BusEta | undefined;
  const motions = new Map<string, BusMotion>();
  let updatingCount = 0;
  for (const frame of recording.frames) {
    const now = Date.parse(frame.at);
    const data = busEtaSchema.parse({ ...recording.data, vehicles: frame.vehicles });
    const result = busEtaSchema.parse(predictBusArrivals(data, true, now, previous));
    const path = buildRoutePath(result.routeSegments);
    for (const bus of result.vehicles) {
      const old = previous?.vehicles.find(v => v.id === bus.id);
      if (old?.tracking && bus.tracking && old.tracking.startedAt === bus.tracking.startedAt) {
        expect(bus.tracking.progress, `${bus.plate} at ${frame.at}`).toBeGreaterThanOrEqual(old.tracking.progress);
      }
      const oldMotion = motions.get(bus.id);
      const distance = oldMotion?.distance;
      const motion = createBusMotion(bus, path, "56:0", "tcm", now, oldMotion);
      if (motion) {
        for (let t = 0; t <= 2000; t += 100) advanceBusMotion(motion, now + t);
        if (distance !== undefined && oldMotion?.trackingStartedAt === motion.trackingStartedAt) expect(motion.distance).toBeGreaterThanOrEqual(distance);
        motions.set(bus.id, motion);
      }
    }
    for (const stop of result.stops) {
      if (stop.arrivalStatus) updatingCount++;
      const old = previous?.stops.find(s => s.stationCode === stop.stationCode)?.arrivalEstimate;
      const next = stop.arrivalEstimate;
      if (old && next && old.vehicleId === next.vehicleId && Math.abs(old.stopProgress! - next.stopProgress!) < 1) {
        expect(Math.abs(next.minutes - old.minutes), `${stop.stationCode} at ${frame.at}`).toBeLessThanOrEqual(2);
      }
      if (old && next && old.vehicleId !== next.vehicleId) expect(next.nextBus).toBe(true);
    }
    previous = result;
  }
  expect(updatingCount).toBeGreaterThan(0);
});
