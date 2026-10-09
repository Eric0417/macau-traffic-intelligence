# Changelog

All notable user-visible and architectural changes are recorded here.

## Competition video male voiceover - 2026-10-09

- Replaced the demo video narration with the male `edge-tts` voice `en-US-AndrewMultilingualNeural` at a +12% rate. Each cue is time-fitted to its existing narration slot, so the picture and the SRT keep their original timing. 7 of 31 cues needed up to 10% extra pace.
- The video stream is copied without re-encoding. The rebuilt file is 269.2 seconds and 25.1 MB. Integrated loudness is -16.5 LUFS, the same as the previous mix.
- Added `competition/video/scripts/revoice.mjs` to swap narration in an already-cut video. `tts.mjs` now generates narration with `edge-tts` instead of Apple `say`. The research report's AI disclosure and both checklists name `edge-tts`.

## Live-detail assistant and flat map with 3D buildings - 2026-10-09

- Fixed bus jitter near stops: the animation now eases down over the last 70 m, never draws a bus past the stop, and holds its drawn position for up to four seconds when a new poll places the bus slightly behind, instead of stepping back. Corrections between polls are blended over 1.6 s.
- Buses now animate between polls: each vehicle advances along its official segment using the feed's speed, falling back to the approaching stop's ETA when the speed is missing or near zero, and resets to the official estimate on every poll. The panel already states that positions are estimates.
- The selected LRT line shows one train that moves along the official line geometry as an explicitly labelled schematic animation (ADR 0008). No live position, countdown, or timetable inference is presented.
- The assistant now carries the official LRT network (lines, stations, interchanges) and answers LRT questions while stating that no official live train positions exist.
- Answers can carry a UI action: a named bus route is drawn on the map with its stops and live vehicles while the answer stays on screen, and a named LRT line is highlighted. A button in the answer opens the matching bus or LRT panel.
- Questions such as "does route 9 serve Taipa?" are checked against the official stop list on the server. The verified yes or no leads the answer, so a weak model cannot flip the result.
- The AI assistant now resolves names in the question. A named bus route triggers live fetches for that route (both directions when one route is named, at most three route-direction slices), so answers can use vehicle plates, the stop each bus is approaching, speed, the low-floor flag, next arrivals, suspended stops, and the per-segment traffic on the official route. A named road is matched against all 1,268 monitored segments and summarised with a segment count, status breakdown, and total length.
- Road answers now list every congested segment and the slowest named segments, not only a count.
- Bus answers state that positions are estimated from the official arrival feed, not GPS. Direction 0 is the outbound trip and direction 1 is the return trip.
- The map ground is flat: terrain elevation is no longer applied, so roads no longer rise and fall with the DEM. The 3D view still tilts the camera and shows extruded buildings from the OpenFreeMap vector tiles. The AWS terrain source and its CSP entries are removed.
- The assistant suggestions now include a bus-position example ("Where is bus 3 right now?").

## AI learning assistant - 2026-10-09

- Added an AI learning assistant behind a server-only adapter (`src/server/sources/assistant.ts`). It answers student questions in Traditional Chinese, Simplified Chinese, or English, using a compact snapshot of the cached normalized data: road status, bridge times, weather, parking, borders, notices, LRT notices, and the focused bus route's arrivals.
- Added `POST /api/v1/assistant` with Zod validation, the shared per-identity rate limit plus a stricter assistant limit, and response meta that names the model. Questions and answers are not stored. `ASSISTANT_TIMEOUT_MS` raises the provider timeout for slower local models.
- Added the AI tutor tab to the desktop rail and mobile sheet: suggested questions, the grounded answer, the snapshot time, and the list of data used.
- The assistant needs `ASSISTANT_API_KEY`. Without it the route returns 503 and every other module keeps working. `ASSISTANT_BASE_URL` (default `https://api.deepseek.com/v1`) and `ASSISTANT_MODEL` (default `deepseek-chat`) accept any OpenAI-compatible endpoint; `ASSISTANT_RATE_LIMIT_PER_MINUTE` defaults to 12; `SOURCE_ASSISTANT_ENABLED=false` disables the route.

## Runtime refresh and local dev fixes - 2026-10-07

- The LRT network now rebuilds from OpenStreetMap route relations at runtime every 6 hours, so new stations and lines appear without a redeploy. The checked-in `data/lrt-network.json` stays as the fallback and keeps the official names for known stations.
- Documented that the bus catalog, notices, cameras, parking, weather, roads, bridges, borders, and LRT notices were already fetched at runtime by the server; a new bus route appears within the 6-hour catalog TTL.
- Local development: `127.0.0.1` is an allowed dev origin, and Playwright reuses a running dev server on `localhost:3100` instead of starting a second one.
- Selecting a bus route now scrolls its detail into view, and switching routes no longer shows the previous route's arrivals while the new payload loads.
- Traffic notices do not repeat the title as the body when DSAT returns the same text for both.
- Bus GLB models load only when a route is focused at street zoom. The 3D layer also attaches models correctly when vehicles arrive before the GLBs finish loading.
- The bus panel no longer shows the raw DSAT `busType` code, which has no published meaning.
- Mobile: the bottom sheet now follows the finger while dragging, snaps by distance or velocity, has a 38 px grip, 44 px route and map controls, 48 px camera rows, safe-area padding, and contained scrolling.
- The LRT source tries an Overpass mirror list (overridable with `LRT_OVERPASS_URL`) and logs when it serves the checked-in fallback.
- `/api/v1/health` now reports per-source failure counts, and `npm run warmup` primes the deployed cache after a release.
- Client polling backs off with jitter while a source is failing, then returns to the base interval after recovery.
- Added a Content-Security-Policy for the map, terrain tiles, and official camera streams.

## Bus 3D layer and station alignment - 2026-10-05

- Buses now render as GLB models in a MapLibre custom WebGL layer. The model uses true meter scale from z17 to z19, then keeps a fixed on-screen size so it stays readable without covering the map at z20+. Lower zoom levels use a marker and plate label.
- Fixed the high-zoom flicker and disappearing model: each vehicle's transform is folded into the MapLibre projection in Float64, the model matrix is refreshed every frame, and the model ignores terrain depth/frustum culling so it remains visible and stable while zooming.
- The map zoom ceiling moved from 17 to 24 so the true-scale bus model can be inspected closely. MapLibre does not provide mathematically infinite zoom; 24 is 128 times the previous scale at the bus layer.
- The source model is `docs/models/bus-models.blend`, with runtime exports `public/models/bus-tcm.glb` and `public/models/bus-transmac.glb`. The 32 heading PNG sprites are removed.
- The generic two-axle model now has front and rear axles and a rear engine grille. It is not presented as brand-specific; DSAT `busType` is exposed in the vehicle payload for later mapping.
- Bus stops are merged by `stationCode` between the arrival and location feeds. Live buses use the feed's `staCode`, route segments carry `fromStationCode` and `toStationCode`, and invalid segments no longer shift later stop pairings.
- Buses approaching the same stop are distributed along their official segment using the stop ETA, and plate labels are shown at route overview zoom.

## Bus model remodel - 2026-10-04

- Superseded 2026-10-05: buses were first rendered as 16 heading PNG sprites; the current implementation uses the GLB custom layer above.
- Rebuilt the two bus models from the operator references: TCM (澳巴) orange body, white front and roof band, white window mullions; Transmac (新福利) yellow body, white front, blue skirt stripe.
- The redesigned bus has a separate glazing band, five window mullions per side, two kerb-side doorways, roof air-conditioning unit, lit destination sign, head and tail lamps, mirrors, and visible wheels with hubs.
- Models are laid out in Blender 5.2 and exported as GLB. Previews are in `docs/models/`.
- An earlier custom-layer attempt did not composite. The current layer initializes Three.js on MapLibre's WebGL context after the map loads.

## Deployment - 2026-10-03

- Live at https://macau-traffic-intelligence.onrender.com on Render project `Macau Traffic Intelligence`, environment `production`.
- Web service `macau-traffic-intelligence` (Docker, singapore, two instances) plus private Key Value `macau-traffic-cache` (256 MB, no persistence).
- Source repository: https://github.com/Eric0417/macau-traffic-intelligence with auto-deploy from `main`.
- Map labels now request the `Noto Sans Regular` glyph set that OpenFreeMap serves, removing a 404 for the default font stack.

## 0.1.0 - 2026-10-03

### Added

- Map-first Traditional Chinese, Simplified Chinese, and English dashboard.
- Road congestion GeoJSON, bridge travel times, and traffic notice layers.
- Direct official HLS camera viewer with lazy single-stream playback.
- Bus route selection, direction switching, and 10-second arrival refresh.
- Public parking availability, weather warnings, border status, and LRT network/notice panels.
- Versioned read-only API under `/api/v1`.
- Redis-compatible shared cache with stale-while-revalidate, locks, circuit state, and rate limiting.
- Render Docker blueprint with two to three instances and private Key Value.
- Fixture-based unit tests, Playwright configuration, live source smoke check, and engineering memory files.

### Data Decisions

- LRT train positions and arrival countdowns are not shown because no trustworthy official real-time API was found.
- Border values are best effort and degrade to the official link or stale values without blocking other modules.
- The border adapter now uses the official live status service and covers all eight checkpoints listed by the Public Security Police Force.
- Camera catalog entries that share an official id because the same camera appears under two zones receive deterministic suffixed ids; byte-identical repeats are dropped.
- No traffic history database is included.

### Fixed

- Map overlays are applied once the map style finishes loading instead of being dropped by a load race.
- The MapLibre stylesheet no longer collapses the full-height map container, so official control styling is used without breaking the layout.
- The bus panel shows every route instead of only the first 30 matches.

### Changed

- Bus catalog now merges the official route page, so seasonal routes (`3AS`, `17S1`, `26S`, `52S`) appear with `live: false` instead of being missing.
- Bus arrivals now include stop coordinates and live vehicles (plate, low-floor flag, speed, approaching stop) from the official station feeds; markers are placed between the previous and approaching stop because DSAT publishes segment-level positions.
- Selecting a route zooms the map to its stops and draws the stop sequence, station markers, and live buses.
- The selected route is drawn with the official polyline from `route/traffic`, coloured per segment by the official traffic level, and each stop badge in the panel shows the same status.
- Bus live requests now mirror the official route page parameters (`action`, `routeType`) for the station feed.
- A zero-minute arrival now reads "即將到站" instead of "即時 分鐘".
- Route buttons no longer show the exclamation badge: the official `routeChange` flag covers 50 of 97 routes and does not mean an active diversion. A diversion banner now appears only when the message feed reports suspended stops, and those stops are marked in the list.
- Bus stops on the map are larger and labelled at close zoom, and live buses use the map's bus icon with the plate label so a selected route is readable at a glance.
- LRT has its own tab: selecting a line highlights the line and its stations on the map, lists the stations with interchange badges, and shows the official service notices. No live train position or countdown is shown because no official feed exists.
- Selecting a bus route now focuses the map on that route: camera, LRT, and congestion overlays hide, the 3D buildings hide, and the route stops get halos and labels.
- Live buses are drawn with an isometric 3D bus icon rotated to their travel direction, positioned at 50% along the official polyline of the stop-to-stop segment they are running on.
- The 3D map can be freely rotated and tilted (drag or two-finger), and the navigation control now shows a compass with pitch.
- Live buses now render as rough 3D models built from extruded geometry: TCM (澳巴) in orange with a white front and Transmac (新福利) in yellow with a blue front, after the operators' current liveries.
- The selected LRT line shows a rough 3D "Ocean Cruiser" train model (pale body, deep blue front, orange wave stripe) at the line start; it is a static livery showcase because no official live train position exists.
- The 3D vehicle models are only drawn at street zoom; below that the rotated icon marker is used.
- Roads layer draws the full street network in grey underneath the 1,268 officially monitored segments and the layer menu states that grey roads have no official live data.
- Map defaults to a 3D view with pitch, extruded buildings from OpenFreeMap vectors, and AWS Open Data terrain; the layer menu toggles it back to flat.
