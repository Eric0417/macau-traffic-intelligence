import type { Feature, FeatureCollection, LineString } from "geojson";

export type Locale = "zh-Hant" | "zh-Hans" | "en";

export interface LocalizedText {
  "zh-Hant": string;
  "zh-Hans": string;
  pt?: string;
  en: string;
}

export type TrafficStatus = "normal" | "slow" | "congested" | "unknown";

export interface SourceAttribution {
  id: string;
  name: string;
  url: string;
  text: string;
}

export interface ResponseMeta {
  generatedAt: string;
  updatedAt: string;
  stale: boolean;
  ttlSeconds: number;
  source: SourceAttribution;
}

export interface ApiEnvelope<T> {
  data: T;
  meta: ResponseMeta;
}

export interface RoadProperties extends Record<string, unknown> {
  id: string;
  name: LocalizedText;
  nameVisible: boolean;
  lengthMeters: number;
  status: TrafficStatus;
  officialLevel: 1 | 2 | 3 | -1;
}

export type RoadFeature = Feature<LineString, RoadProperties>;
export type RoadCollection = FeatureCollection<LineString, RoadProperties>;

export interface BridgeTime {
  id: string;
  name: LocalizedText;
  direction: "northbound" | "southbound";
  runtimeSeconds: number;
  status: TrafficStatus;
  officialLevel: number;
}

export interface Camera {
  id: string;
  name: LocalizedText;
  location: LocalizedText;
  coordinates: [number, number];
  zone: LocalizedText;
  subzone: LocalizedText;
  streamUrl: string;
  mediaType: "hls";
}

export interface BusCompany {
  id: string;
  name: string;
  color: "blue" | "orange";
}

export interface BusRoute {
  routeName: string;
  routeCode: string;
  routeType: 0 | 2;
  company: BusCompany;
  hasChange: boolean;
  live: boolean;
}

export interface BusEtaStop {
  sequence: number;
  stationCode: string;
  stationName: string;
  etaMinutes: number | null;
  averageMinutes: number | null;
  messageCode: string;
  coordinates: [number, number] | null;
  trafficStatus: TrafficStatus;
  trafficLevel: number;
  suspended: boolean;
}

export interface BusVehicle {
  id: string;
  plate: string;
  busType: string;
  lowFloor: boolean;
  speedKph: number | null;
  status: string;
  stationCode: string;
  stationName: string;
  stationSequence: number;
  coordinates: [number, number] | null;
  bearing: number | null;
  estimated: boolean;
}

export interface BusRouteSegment {
  fromStationCode: string;
  toStationCode: string;
  trafficStatus: TrafficStatus;
  trafficLevel: number;
  coordinates: Array<[number, number]>;
}

export interface BusEta {
  routeName: string;
  routeCode: string;
  direction: 0 | 1;
  stops: BusEtaStop[];
  vehicles: BusVehicle[];
  routeSegments: BusRouteSegment[];
  diversion: {
    suspendedStops: Array<{ stationCode: string; stationName: string }>;
  };
}

export interface ParkingAvailability {
  lightVehicle: number | null;
  motorcycle: number | null;
  electricVehicle: number | null;
  electricMotorcycle: number | null;
  accessible: number | null;
  heavyVehicleShort: number | null;
  heavyVehicleLong: number | null;
}

export interface ParkingFacility {
  id: string;
  name: string;
  updatedAt: string;
  areaStatus: "green" | "yellow" | "orange" | "unknown";
  availability: ParkingAvailability;
}

export interface WeatherWarning {
  type: string;
  updatedAt: string | null;
  text: string;
  active: boolean;
}

export interface WeatherSnapshot {
  observedAt: string | null;
  temperatureCelsius: number | null;
  humidityPercent: number | null;
  wind: string | null;
  forecast: string | null;
  warnings: WeatherWarning[];
}

export interface BorderStatus {
  id: string;
  name: LocalizedText;
  status: "clear" | "busy" | "very_busy" | "closed" | "unknown";
  estimatedWaitMinutes: number | null;
  updatedAt: string | null;
  sourceUrl: string;
}

export interface LrtNotice {
  id: string;
  title: string;
  content: string;
  publishedAt: string;
  active: boolean;
}

export interface LrtNetwork {
  lines: FeatureCollection<
    LineString,
    {
      id: string;
      ref: string;
      name: LocalizedText;
      color: string;
    }
  >;
  stations: Array<{
    id: string;
    name: LocalizedText;
    coordinates: [number, number];
    lines: string[];
    interchange: boolean;
  }>;
  timetableEdition: string;
  sourceUpdatedAt: string;
}

export interface TrafficNotice {
  id: string;
  title: string;
  content: string;
  publishedAt: string | null;
  category: "incident" | "roadworks" | "bus-change" | "general";
  url: string;
}
