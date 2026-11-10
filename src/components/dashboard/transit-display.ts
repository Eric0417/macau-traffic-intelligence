export type TransitModelKind =
  | "tcm"
  | "transmac"
  | "bus-stop"
  | "lrt-platform"
  | "lrt-car";

export function modelMinimumZoom(kind: TransitModelKind): number {
  return kind === "lrt-car" ? 12 : 14;
}

// One fixed world-space exaggeration for all schematic transit models.
export const TRANSIT_DISPLAY_SCALE = 4;
