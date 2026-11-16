import "server-only";
import { bordersSource } from "@/server/sources/borders";
import { bridgesSource } from "@/server/sources/bridges";
import { busRoutesSource } from "@/server/sources/bus";
import { busNetworkSource } from "@/server/sources/bus-network";
import { camerasSource } from "@/server/sources/cameras";
import { lrtNetworkSource, lrtNoticesSource } from "@/server/sources/lrt";
import { lrtServiceSource } from "@/server/sources/lrt-service";
import { noticesSource } from "@/server/sources/notices";
import { officialNewsSource } from "@/server/sources/official-news";
import { parkingSource } from "@/server/sources/parking";
import { roadForecastSource, roadsSource } from "@/server/sources/roads";
import { walkingNetworkSource } from "@/server/sources/walking-network";
import { weatherSource } from "@/server/sources/weather";

export const sources = {
  roads: roadsSource,
  roadForecast: roadForecastSource,
  bridges: bridgesSource,
  cameras: camerasSource,
  busRoutes: busRoutesSource,
  busNetwork: busNetworkSource,
  walkingNetwork: walkingNetworkSource,
  parking: parkingSource,
  weather: weatherSource,
  notices: noticesSource,
  officialNews: officialNewsSource,
  lrtNetwork: lrtNetworkSource,
  lrtNotices: lrtNoticesSource,
  lrtService: lrtServiceSource,
  borders: bordersSource,
} as const;

export type SourceName = keyof typeof sources;
