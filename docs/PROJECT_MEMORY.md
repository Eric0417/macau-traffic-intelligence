# Project Memory

## Current State

Version `0.1.0` is implemented as a standalone Next.js 16 application. The first screen is the live map, with a desktop information rail and a mobile bottom sheet. It supports Traditional Chinese, Simplified Chinese, and English.

It is deployed on Render as project `Macau Traffic Intelligence`, environment `production`, at https://macau-traffic-intelligence.onrender.com. The service runs two instances in Singapore with a private Render Key Value instance for cache, locks, circuit state, and rate limiting; autoscaling remains declarative until the workspace is on a Pro plan.

The `competition/` folder holds the 2026 competition submission package: English documents and poster sources, the scripted video pipeline, the user-testing kit, and the submission checklist. See `competition/README.md`.

## Architecture

- `src/server/sources/` owns all external payload parsing and normalization.
- `src/server/cache.ts` owns shared TTL cache, stale fallback, source locks, circuit state, and rate limiting.
- `src/server/sources/assistant.ts` owns the AI assistant: it builds a compact snapshot from the cached normalized sources and calls an OpenAI-compatible chat completions endpoint. See ADR 0007.
- `src/app/api/v1/` exposes the public read-only API.
- `src/components/` owns the map-first presentation and client polling.
- `data/lrt-network.json` is generated from OpenStreetMap route relations and official LRT station names.
- The LRT network is rebuilt from OpenStreetMap at runtime every 6 hours. The checked-in JSON is the fallback and supplies official names for stations it already knows. See ADR 0006.

External data never enters a client component directly. Public contracts are defined in `src/lib/contracts.ts`.

## Product Decisions

- Public audience first: residents, visitors, and commuters.
- Traditional Chinese is the default language.
- Roads, buses, cameras, bridges, parking, weather, and active notices are prioritized above decorative presentation.
- The map opens in a 3D view (pitch and extruded buildings on a flat ground plane) that users can switch back to flat in the layer menu. Terrain elevation is not applied, so roads stay level.
- Bus routes show the full official catalog, including seasonal services that are flagged as having no live tracking.
- All live data refreshes at runtime. The bus catalog and the LRT network are fetched every 6 hours, so new routes, lines, and stations appear without a redeploy. Roads, bridges, parking, weather, notices, cameras, borders, and bus arrivals follow their documented TTLs.
- Live bus markers use the official between-stop segments, not raw GPS, and the UI says so.
- Selecting a bus route zooms the map to the route, draws every official stop, and marks live buses with plate and bus icon.
- While a bus route is focused, the camera, LRT, congestion, and 3D building layers hide so only the selected route, its stops, and its buses stay on the map.
- Live bus positions are estimates along the official polyline, placed by the approaching stop's `stationCode` and spread within a segment when more than one bus is approaching the same stop.
- Buses render as generic two-axle GLB models in a MapLibre custom WebGL layer at the maximum street zoom. Lower zoom levels use a marker and plate label. The Blender source is `docs/models/bus-models.blend`; runtime exports are `public/models/bus-tcm.glb` and `public/models/bus-transmac.glb`.
- The bus custom layer folds each vehicle transform into the MapLibre projection in Float64, refreshes its matrices every frame, and ignores terrain depth and frustum culling so the model does not flicker or disappear above z19.
- The map allows zoom up to 24 so the true-scale bus model can be inspected; MapLibre does not provide infinite zoom.
- The LRT line still shows a static extruded "Ocean Cruiser" train because no live train feed or train sprite sheet exists.
- The 3D bus model is true scale from z17 to z19. Above z19 its on-screen size is fixed so the model remains readable instead of filling the viewport.
- The 3D map supports free rotate and tilt; the navigation control keeps a compass and pitch indicator.
- The route `routeChange` flag is not used for badges because it covers most routes; diversions come from the suspended-stop message feed.
- LRT has the same selection flow as buses: pick a line, see its stations highlighted on the map and listed with interchange badges. It shows only the official fixed network and service notices, with no simulated live positions.
- The UI does not use a hero page or feature marketing copy.
- The AI assistant answers in the selected locale and is grounded in a JSON snapshot of the normalized live data. A bus route named in the question is fetched live (full stop list, vehicle plates, approaching stops, next arrivals, per-segment traffic; both directions for a single route), a named road is matched against the monitored segments with a status breakdown, and the official LRT network (lines, stations, interchanges) is included with the statement that no live train positions exist. Route place questions are verified against the official stop list and the verified yes or no leads the answer. The prompt requires the snapshot time, an explanation with a next check or a small follow-up task, no invented destinations, and no personal data. The panel shows the snapshot time and the list of data that grounded the answer.
- Assistant answers can carry a UI action: a named bus route is drawn on the map with its stops and live vehicles while the answer stays visible, a named LRT line is highlighted, and a button in the answer opens the matching bus or LRT panel.
- Assistant replies are not cached and questions are not stored. The provider key stays server-side; without `ASSISTANT_API_KEY` the assistant endpoint returns 503 and the rest of the app is unaffected.

## Known Risks

- DSAT dynamic endpoints are used by official web applications but are not all formally documented. Response fields can change without notice.
- The Public Security Police border status endpoint is used by its official mobile pages but is not a documented public API. It may change or block server requests; border data remains optional and other modules must continue to work.
- OpenFreeMap and camera HLS availability are external runtime dependencies.
- Extruded buildings depend on OpenFreeMap vector tiles; the ground is flat because no terrain elevation source is loaded.
- The 3D bus layer needs WebGL2 and successful GLB loading. If either fails, the 2D marker and plate label remain, but the 3D model does not render.
- The LRT network refresh depends on the Overpass API. Outages or incomplete results fall back to the checked-in network; new lines and stations can carry OSM names instead of official MLM names.
- DSAT `busType` values are exposed in the public payload but are not mapped to specific vehicle brands or models because no documented mapping exists.
- Only the 1,268 segments DSAT publishes carry congestion status. Grey roads mean no official live data, not clear traffic.
- Render Key Value is private to the workspace. Local development falls back to a process-memory cache.
- The AI assistant depends on an external LLM provider and a funded API key. The grounding context limits but cannot eliminate model errors, and the same question can produce different wording between calls.

## Next Work

- Add location-aware nearby stops and parking without sending precise user coordinates to the server.
- Add a source-history dashboard after a decision to store time-series data.
- Revisit LRT live arrivals only if MLM or DSAT publishes a stable official API.
- Map `busType` to model variants only if DSAT publishes a stable type-to-vehicle mapping.
- Add visual regression baselines when the layout is stable.
