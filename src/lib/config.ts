export const APP_NAME = "澳門交通情報";
export const APP_NAME_EN = "Macau Traffic Intelligence";
export const APP_DESCRIPTION =
  "澳門即時交通地圖，整合道路擁塞、跨海橋時間、交通鏡頭、巴士到站、停車場、天氣與口岸資訊。";

export const MACAU_CENTER: [number, number] = [113.5528, 22.1752];
export const MACAU_BOUNDS: [[number, number], [number, number]] = [
  [113.50, 22.09],
  [113.62, 22.23],
];

export const BUS_MODEL_MIN_ZOOM = 17;

export const DEFAULT_LOCALE = "zh-Hant" as const;

export const CACHE_PREFIX = "macau-traffic:v1";

export function sourceEnabled(envKey: string): boolean {
  const value = process.env[envKey];
  return value === undefined || value.toLowerCase() !== "false";
}
