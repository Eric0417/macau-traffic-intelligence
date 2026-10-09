import { z } from "zod";

const localizedTextSchema = z.object({
  "zh-Hant": z.string(),
  "zh-Hans": z.string(),
  pt: z.string().optional(),
  en: z.string(),
});

export const trafficStatusSchema = z.enum(["normal", "slow", "congested", "unknown"]);

export const roadPropertiesSchema = z.object({
  id: z.string(),
  name: localizedTextSchema,
  nameVisible: z.boolean(),
  lengthMeters: z.number().nonnegative(),
  status: trafficStatusSchema,
  officialLevel: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(-1)]),
});

export const roadCollectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(
    z.object({
      type: z.literal("Feature"),
      properties: roadPropertiesSchema,
      geometry: z.object({
        type: z.literal("LineString"),
        coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
      }),
    }),
  ),
});

export const bridgeTimeSchema = z.object({
  id: z.string(),
  name: localizedTextSchema,
  direction: z.enum(["northbound", "southbound"]),
  runtimeSeconds: z.number().nonnegative(),
  status: trafficStatusSchema,
  officialLevel: z.number(),
});

export const cameraSchema = z.object({
  id: z.string(),
  name: localizedTextSchema,
  location: localizedTextSchema,
  coordinates: z.tuple([z.number(), z.number()]),
  zone: localizedTextSchema,
  subzone: localizedTextSchema,
  streamUrl: z.string().url(),
  mediaType: z.literal("hls"),
});

export const busCompanySchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.enum(["blue", "orange"]),
});

export const busRouteSchema = z.object({
  routeName: z.string(),
  routeCode: z.string(),
  routeType: z.union([z.literal(0), z.literal(2)]),
  company: busCompanySchema,
  hasChange: z.boolean(),
  live: z.boolean(),
});

export const busEtaStopSchema = z.object({
  sequence: z.number().int().nonnegative(),
  stationCode: z.string(),
  stationName: z.string(),
  etaMinutes: z.number().nonnegative().nullable(),
  averageMinutes: z.number().nonnegative().nullable(),
  messageCode: z.string(),
  coordinates: z.tuple([z.number(), z.number()]).nullable(),
  trafficStatus: trafficStatusSchema,
  trafficLevel: z.number().int(),
  suspended: z.boolean(),
});

export const busVehicleSchema = z.object({
  id: z.string(),
  plate: z.string(),
  busType: z.string(),
  lowFloor: z.boolean(),
  speedKph: z.number().nonnegative().nullable(),
  status: z.string(),
  stationCode: z.string(),
  stationName: z.string(),
  stationSequence: z.number().int().nonnegative(),
  coordinates: z.tuple([z.number(), z.number()]).nullable(),
  bearing: z.number().nullable(),
  estimated: z.boolean(),
});

export const busRouteSegmentSchema = z.object({
  fromStationCode: z.string(),
  toStationCode: z.string(),
  trafficStatus: trafficStatusSchema,
  trafficLevel: z.number().int(),
  coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
});

export const busEtaSchema = z.object({
  routeName: z.string(),
  routeCode: z.string(),
  direction: z.union([z.literal(0), z.literal(1)]),
  stops: z.array(busEtaStopSchema),
  vehicles: z.array(busVehicleSchema),
  routeSegments: z.array(busRouteSegmentSchema),
  diversion: z.object({
    suspendedStops: z.array(
      z.object({ stationCode: z.string(), stationName: z.string() }),
    ),
  }),
});

export const parkingFacilitySchema = z.object({
  id: z.string(),
  name: z.string(),
  updatedAt: z.string(),
  areaStatus: z.enum(["green", "yellow", "orange", "unknown"]),
  availability: z.object({
    lightVehicle: z.number().int().nullable(),
    motorcycle: z.number().int().nullable(),
    electricVehicle: z.number().int().nullable(),
    electricMotorcycle: z.number().int().nullable(),
    accessible: z.number().int().nullable(),
    heavyVehicleShort: z.number().int().nullable(),
    heavyVehicleLong: z.number().int().nullable(),
  }),
});

export const weatherSnapshotSchema = z.object({
  observedAt: z.string().nullable(),
  temperatureCelsius: z.number().nullable(),
  humidityPercent: z.number().nullable(),
  wind: z.string().nullable(),
  forecast: z.string().nullable(),
  warnings: z.array(
    z.object({
      type: z.string(),
      updatedAt: z.string().nullable(),
      text: z.string(),
      active: z.boolean(),
    }),
  ),
});

export const borderStatusSchema = z.object({
  id: z.string(),
  name: localizedTextSchema,
  status: z.enum(["clear", "busy", "very_busy", "closed", "unknown"]),
  estimatedWaitMinutes: z.number().nonnegative().nullable(),
  updatedAt: z.string().nullable(),
  sourceUrl: z.string().url(),
});

export const trafficNoticeSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  publishedAt: z.string().nullable(),
  category: z.enum(["incident", "roadworks", "bus-change", "general"]),
  url: z.string().url(),
});

export const lrtNoticeSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  publishedAt: z.string(),
  active: z.boolean(),
});

export const learningAssistantRequestSchema = z.object({
  question: z.string().trim().min(2).max(500),
  locale: z.enum(["zh-Hant", "zh-Hans", "en"]),
  focus: z
    .object({
      routeCode: z.string().trim().min(1).max(12),
      direction: z.union([z.literal(0), z.literal(1)]),
    })
    .optional(),
});

export const learningAssistantAnswerSchema = z.object({
  answer: z.string().min(1),
  model: z.string().min(1),
  locale: z.enum(["zh-Hant", "zh-Hans", "en"]),
  snapshotAt: z.string(),
  contextSummary: z.array(z.string()),
});

export const contractBySource = {
  roads: roadCollectionSchema,
  bridges: z.array(bridgeTimeSchema),
  cameras: z.array(cameraSchema),
  busRoutes: z.array(busRouteSchema),
  parking: z.array(parkingFacilitySchema),
  weather: weatherSnapshotSchema,
  borders: z.array(borderStatusSchema),
  notices: z.array(trafficNoticeSchema),
  lrtNotices: z.array(lrtNoticeSchema),
} as const;
