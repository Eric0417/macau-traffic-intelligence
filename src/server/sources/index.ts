import "server-only";
import { bordersSource } from "@/server/sources/borders";
import { bridgesSource } from "@/server/sources/bridges";
import { busRoutesSource } from "@/server/sources/bus";
import { camerasSource } from "@/server/sources/cameras";
import { lrtNetworkSource, lrtNoticesSource } from "@/server/sources/lrt";
import { noticesSource } from "@/server/sources/notices";
import { parkingSource } from "@/server/sources/parking";
import { roadsSource } from "@/server/sources/roads";
import { weatherSource } from "@/server/sources/weather";

export const sources = {
  roads: roadsSource,
  bridges: bridgesSource,
  cameras: camerasSource,
  busRoutes: busRoutesSource,
  parking: parkingSource,
  weather: weatherSource,
  notices: noticesSource,
  lrtNetwork: lrtNetworkSource,
  lrtNotices: lrtNoticesSource,
  borders: bordersSource,
} as const;

export type SourceName = keyof typeof sources;
