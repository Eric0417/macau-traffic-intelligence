import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { cameraSchema } from "@/lib/contracts";
import type { LocalizedText } from "@/lib/types";
import { createDsatToken } from "@/server/dsat-token";
import { fetchJson } from "@/server/http";
import type { SourceDefinition } from "@/server/source";

const CAMERA_ENDPOINT =
  "https://bis.dsat.gov.mo:37812/ddbus/common/supermap/traffic/video";

const rawCameraSchema = z.object({
  id: z.string(),
  nameCN: z.string(),
  nameTW: z.string(),
  namePT: z.string().optional().default(""),
  nameEN: z.string().optional().default(""),
  lng: z.string(),
  lat: z.string(),
  locationCN: z.string(),
  locationTW: z.string(),
  locationPT: z.string().optional().default(""),
  locationEN: z.string().optional().default(""),
  camUrl: z.string().url(),
  camType: z.string(),
  camZoneCN: z.string(),
  camZoneTW: z.string(),
  camZonePT: z.string().optional().default(""),
  camZoneEN: z.string().optional().default(""),
  camZoneSubCN: z.string(),
  camZoneSubTW: z.string(),
  camZoneSubPT: z.string().optional().default(""),
  camZoneSubEN: z.string().optional().default(""),
});

const responseSchema = z.object({
  header: z.object({ status: z.string() }),
  data: z.array(rawCameraSchema),
});

function localized(
  traditional: string,
  simplified: string,
  portuguese: string,
  english: string,
): LocalizedText {
  return {
    "zh-Hant": traditional,
    "zh-Hans": simplified,
    pt: portuguese || undefined,
    en: english || traditional,
  };
}

function cameraKey(camera: z.infer<typeof rawCameraSchema>): string {
  return [camera.camUrl, camera.camZoneTW, camera.camZoneSubTW].join("|");
}

// The official catalog lists the same physical camera once per zone with a shared
// id. Drop byte-identical repeats and suffix only colliding ids so map features
// and list keys stay deterministic.
function withUniqueIds(cameras: Array<z.infer<typeof rawCameraSchema>>) {
  const seenRecords = new Set<string>();
  const deduped = cameras.filter((camera) => {
    const key = `${camera.id}|${cameraKey(camera)}`;
    if (seenRecords.has(key)) return false;
    seenRecords.add(key);
    return true;
  });

  const idCounts = new Map<string, number>();
  for (const camera of deduped) {
    idCounts.set(camera.id, (idCounts.get(camera.id) ?? 0) + 1);
  }

  return deduped.map((camera) => {
    if ((idCounts.get(camera.id) ?? 0) < 2) return camera;

    const suffix = createHash("sha1").update(cameraKey(camera)).digest("hex").slice(0, 6);
    return { ...camera, id: `${camera.id}-${suffix}` };
  });
}

export async function loadCameras() {
  const data = { device: "web", HUID: "cc57da25-d5d8-4286-8712-d98df57c8af6" };
  const body = new URLSearchParams(data).toString();

  const response = responseSchema.parse(
    await fetchJson(CAMERA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        token: createDsatToken(data),
      },
      body,
      timeoutMs: 8_000,
    }),
  );

  if (response.header.status !== "000") {
    throw new Error(`DSAT camera endpoint returned ${response.header.status}`);
  }

  return withUniqueIds(
    response.data.filter((camera) => camera.camType === "1" && camera.camUrl.endsWith(".m3u8")),
  )
    .map((camera) =>
      cameraSchema.parse({
        id: camera.id,
        name: localized(camera.nameTW, camera.nameCN, camera.namePT, camera.nameEN),
        location: localized(
          camera.locationTW,
          camera.locationCN,
          camera.locationPT,
          camera.locationEN,
        ),
        coordinates: [Number(camera.lng), Number(camera.lat)],
        zone: localized(camera.camZoneTW, camera.camZoneCN, camera.camZonePT, camera.camZoneEN),
        subzone: localized(
          camera.camZoneSubTW,
          camera.camZoneSubCN,
          camera.camZoneSubPT,
          camera.camZoneSubEN,
        ),
        streamUrl: camera.camUrl,
        mediaType: "hls",
      }),
    );
}

export const camerasSource: SourceDefinition<Awaited<ReturnType<typeof loadCameras>>> = {
  id: "cameras",
  name: "DSAT 交通鏡頭",
  url: "https://www.dsat.gov.mo/dsat/realtime.aspx",
  attribution: "交通事務局公開直播影像",
  envKey: "SOURCE_CAMERAS_ENABLED",
  ttlSeconds: 21_600,
  staleTtlSeconds: 604_800,
  schema: z.array(cameraSchema),
  load: loadCameras,
};
