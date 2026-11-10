import type { Coordinates } from "./resident-tools";

// Opened only by a user's link click; no location request is sent on render.
export function walkingNavigationUrl(from: Coordinates, to: Coordinates): string {
  const params = new URLSearchParams({
    api: "1", origin: `${from[1]},${from[0]}`, destination: `${to[1]},${to[0]}`, travelmode: "walking",
  });
  return `https://www.google.com/maps/dir/?${params}`;
}
