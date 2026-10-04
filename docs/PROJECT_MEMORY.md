# Project Memory

## Current State

Version `0.1.0` is implemented as a standalone Next.js 16 application. The first screen is the live map, with a desktop information rail and a mobile bottom sheet. It supports Traditional Chinese, Simplified Chinese, and English.

It is deployed on Render as project `Macau Traffic Intelligence`, environment `production`, at https://macau-traffic-intelligence.onrender.com. The service runs two instances in Singapore with a private Render Key Value instance for cache, locks, circuit state, and rate limiting; autoscaling remains declarative until the workspace is on a Pro plan.

## Architecture

- `src/server/sources/` owns all external payload parsing and normalization.
- `src/server/cache.ts` owns shared TTL cache, stale fallback, source locks, circuit state, and rate limiting.
- `src/app/api/v1/` exposes the public read-only API.
- `src/components/` owns the map-first presentation and client polling.
- `data/lrt-network.json` is generated from OpenStreetMap route relations and official LRT station names.

External data never enters a client component directly. Public contracts are defined in `src/lib/contracts.ts`.

## Product Decisions

- Public audience first: residents, visitors, and commuters.
- Traditional Chinese is the default language.
- Roads, buses, cameras, bridges, parking, weather, and active notices are prioritized above decorative presentation.
- The map opens in a 3D view (pitch, extruded buildings, terrain) that users can switch back to flat in the layer menu.
- Bus routes show the full official catalog, including seasonal services that are flagged as having no live tracking.
- Live bus markers use the official between-stop segments, not raw GPS, and the UI says so.
- Selecting a bus route zooms the map to the route, draws every official stop, and marks live buses with plate and bus icon.
- While a bus route is focused, the camera, LRT, congestion, and 3D building layers hide so only the selected route, its stops, and its buses stay on the map.
- Live bus markers are estimates along the official polyline, drawn with a rotated 3D bus icon, because DSAT publishes no GPS coordinates.
- Buses are drawn from 32 Blender renders (`public/models/bus-{tcm,transmac}-0..15.png`), one per 22.5 degrees of travel bearing, picked per vehicle by bearing and kept upright with `icon-pitch-alignment: viewport`. Extruded bus geometry was tried first and rejected: the overlapping prisms read as striped blocks.
- The LRT line still shows a static extruded "Ocean Cruiser" train because no live train feed or train sprite sheet exists.
- Display models are exaggerated so a 12 m bus stays visible at city zoom; the UI states this.
- The 3D map supports free rotate and tilt; the navigation control keeps a compass and pitch indicator.
- The route `routeChange` flag is not used for badges because it covers most routes; diversions come from the suspended-stop message feed.
- LRT has the same selection flow as buses: pick a line, see its stations highlighted on the map and listed with interchange badges. It shows only the official fixed network and service notices, with no simulated live positions.
- The UI does not use a hero page or feature marketing copy.

## Known Risks

- DSAT dynamic endpoints are used by official web applications but are not all formally documented. Response fields can change without notice.
- The Public Security Police border status endpoint is used by its official mobile pages but is not a documented public API. It may change or block server requests; border data remains optional and other modules must continue to work.
- OpenFreeMap and camera HLS availability are external runtime dependencies.
- 3D terrain depends on AWS Open Data terrain tiles; extruded buildings depend on OpenFreeMap vector tiles.
- Only the 1,268 segments DSAT publishes carry congestion status. Grey roads mean no official live data, not clear traffic.
- Render Key Value is private to the workspace. Local development falls back to a process-memory cache.

## Next Work

- Add location-aware nearby stops and parking without sending precise user coordinates to the server.
- Add a source-history dashboard after a decision to store time-series data.
- Revisit LRT live arrivals only if MLM or DSAT publishes a stable official API.
- Add visual regression baselines when the layout is stable.
