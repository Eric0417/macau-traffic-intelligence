# Changelog

All notable user-visible and architectural changes are recorded here.

## Bus model remodel - 2026-10-04

- Buses on the map are now Blender-rendered sprites instead of extruded prisms: 16 headings per livery, drawn upright and rotated to the travel bearing, which reads as a bus at any pitch.
- The extruded bus geometry produced overlapping prisms that looked like striped blocks on screen, so it was replaced by the sprite sheet.
- Rebuilt the two bus models from the operator references: TCM (澳巴) orange body, white front and roof band, white window mullions; Transmac (新福利) yellow body, white front, blue skirt stripe.
- The redesigned bus has a separate glazing band, five window mullions per side, two kerb-side doorways, roof air-conditioning unit, lit destination sign, head and tail lamps, mirrors, and visible wheels with hubs.
- Models were laid out in Blender 5.2 and the proportions and parts were ported to the MapLibre extruded geometry the map uses. Previews are in `docs/models/`.
- Blender GLB export and a three.js custom layer were tried first and dropped: the layer produced draw calls that MapLibre 6 never composited onto the map, so the shipped model stays native extruded geometry.

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
