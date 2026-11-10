# Project Memory

## Current State

Version `0.1.0` is a standalone Next.js 16 application with Traditional Chinese, Simplified Chinese and English. The local `codex/resident-workspace` revision (2026-11-10) replaces the map overlays with a resident travel workspace: five primary sections, a desktop list/map split, mobile list/map switching and fixed navigation. This revision has not been deployed. See `tasks/plan.md` and `docs/qa/resident-workspace/VERIFICATION.md`.

The existing deployment is recorded on Render as project `Macau Traffic Intelligence`, environment `production`, at https://macau-traffic-intelligence.onrender.com. The service runs two instances in Singapore with a private Render Key Value instance for cache, locks, circuit state, and rate limiting; autoscaling remains declarative until the workspace is on a Pro plan.

The `competition/` folder holds the 2026 competition submission package: English documents and poster sources, the scripted video pipeline, the user-testing kit, and the submission checklist. The submitted demo video uses the `edge-tts` Andrew male voice (`en-US-AndrewMultilingualNeural`). `video/scripts/revoice.mjs` replaces narration in an already-cut video and time-fits each cue to its existing slot; `tts.mjs` uses the same voice for full rebuilds. See `competition/README.md`.

## Architecture

- `src/server/sources/` owns all external payload parsing and normalization.
- `src/server/cache.ts` owns shared TTL cache, stale fallback, source locks, circuit state, and rate limiting.
- `src/server/sources/assistant.ts` owns the AI assistant: it builds a compact snapshot from the cached normalized sources and calls an OpenAI-compatible chat completions endpoint. See ADR 0007.
- `src/app/api/v1/` exposes the public read-only API.
- `src/components/` owns the resident workspace, map presentation, local favourites and client polling.
- `data/lrt-network.json` is generated from OpenStreetMap route relations and official LRT station names.
- The LRT network is rebuilt from OpenStreetMap at runtime every 6 hours. The checked-in JSON is the fallback and supplies official names for stations it already knows. See ADR 0006.

External data never enters a client component directly. Public contracts are defined in `src/lib/contracts.ts`.

## Product Decisions

- Public audience first: residents, visitors, and commuters.
- Traditional Chinese is the default language.
- The interface has Travel, Buses, LRT, Parking and AI. The header More button contains road overview, published announcements, cameras and source status. There is one mounted content workspace. AI answers remain mounted across section changes.
- Desktop shows the list and map side by side. Phones use native scrolling lists and an explicit map/list switch. Navigation stays outside the scroll region. Touch map rotation/pitch is disabled; pinch zoom and pan remain. Primary navigation has arrow/Home/End keyboard support.
- Interface text uses variable Noto Sans TC, bundled by `next/font/google` and served locally. Modules use rounded cards on a quiet background; long station/facility lists stay compact inside their cards. The build downloads font subsets, while visitors make no Google font requests.
- Card/detail changes use element-scoped View Transitions inside the content panel, with a shared selected-card identity, reversed return motion and route-list scroll/focus restoration. The map and navigation remain outside the snapshot scope. A short transform/opacity fallback supports other browsers; reduced motion uses direct updates. Mobile list/map exits become inert and hidden from the accessibility tree during the visual transition, with focus handed to the entering view. Desktop keeps both panes interactive.
- Day/night appearance and up to 100 favourites stay in local storage with an in-memory fallback. Explicit location is used for browser-only straight-line parking distances, never sent to the public API or assistant. There is no account sync.
- The map starts in 2D. Optional 3D tilts the flat ground plane and can show extruded buildings; no terrain elevation is applied. Day/night mode recolours only base-style layers, preserving traffic colours. Map size follows the actual container via ResizeObserver.
- MapLibre creates the shared WebGL context with antialiasing enabled. Native device pixel ratio is preserved. Bus animation stops when all markers reach their official target estimates, resumes on new estimates and pauses in hidden documents. The frozen-fixture workload comparison is in `docs/qa/resident-workspace/map-performance.json`; it is not a physical-device FPS result.
- Source retrieval, publisher timestamps, loading/error and delayed states are distinct. A previously fresh snapshot ages on the client after lost contact. The waiting-stop card carries its own source note.
- Source information is shown without an all-clear implication when unavailable. SMG forecast and warnings are visible, parking covers all official vehicle categories without an 80-row cap, and unknown figures remain unknown.
- Bus routes show the full official catalog, including seasonal services that are flagged as having no live tracking.
- All live data refreshes at runtime. The bus catalog and the LRT network are fetched every 6 hours, so new routes, lines, and stations appear without a redeploy. Roads, bridges, parking, weather, notices, cameras, borders, and live bus positions follow their documented TTLs.
- Live bus markers use the official between-stop segments, not raw GPS, and the UI says so.
- Selecting a bus route zooms the map to the route, draws every official stop, and marks live buses with plate and bus icon.
- Selecting the LRT tab enters a clean LRT view: roads, cameras, congestion, 3D buildings, and other overlays hide while the tab is open. With a line selected, only that line, its stations, and the labelled schematic train stay on the map.
- Every tab narrows the map to its own subject: parking shows only mapped car parks, cameras show only camera markers, and published announcements show only monitored road segments whose names match the selected item (or nothing when the message names an unmonitored street). Overview and the assistant keep the general map.
- Clicking a car park in the list flies the map to it and draws a blue selection ring. `data/parking-locations.json` gives all 92 DSAT car parks a map position: 78 match OpenStreetMap `amenity=parking` coordinates (ODbL) by name, and 14 use the DSSCU WebMap Carpark POI layer as a build-time fallback. `npm run build:parking` regenerates both passes; the runtime never calls the GIS service.
- Traffic announcements separate GCS/DSAT RSS news from the older DSAT arrangements. Publisher dates are not retrieval time or event activation time. Keyword categories do not prove an ongoing incident, and no messages does not mean no accidents. `/api/v1/traffic/news` exposes normalized items plus per-feed availability, with shared-cache fallback. See `docs/SOURCE_AUDIT_2026-11-10.md`.
- Border statuses are qualitative. `estimatedWaitMinutes` remains null until a real numeric publisher field is verified. Missing/invalid parking timestamps remain null.
- Bus users choose a route, direction and waiting stop. The panel has in-route station-name/code search and local favourites. Suspended-stop state takes priority over an approaching-bus value. Vehicle details are collapsed below the stop list.
- While a bus route is focused, the camera, LRT, congestion, and 3D building layers hide so only the selected route, its stops, and its buses stay on the map.
- Live bus positions are the position estimates the official bus report publishes per plate (`busInfoList` in the stop-location feed, the same coordinates the official map page draws), falling back to the coordinates of the stop each bus is approaching. Each vehicle names the `routeSegments` entry used for its position in `segmentIndex`. The map concatenates the official stop-to-stop segments into one path and glides each marker from its drawn position toward the newest official estimate at a bounded bus speed; the marker holds when the estimate does not change, and loop routes continue into the next lap.
- The bus panel stop list shows the official stops-away metric, not minutes: a stop a bus is heading to shows 即將進站 with the plate and a bus icon, later stops show 還有 N 站, and stops behind every bus on a line route show a dash. `/ddbus/app/passenger/route` turned out to be the half-hourly waiting-time/flow statistics feed and is no longer read. See ADR 0010.
- Blender 5.2.2 assets now include two operator-livery buses, a red/white sign with stacked cylindrical timetable cabinets from the user's reference, and an LRT canopy/platform marker. Five self-contained GLBs total 962,612 bytes. `scripts/build-transit-models.py` rebuilds `docs/models/transit-models-v2.blend`, GLBs and previews; the earlier `.blend` is preserved. References and model limits are in `docs/models/REFERENCES.md`.
- Three.js loads when 3D is enabled. Models load from z14 for required types (LRT carriages from z12) and retain flat markers on failure. All model kinds use the same fixed 4x world-space display scale. Zoom changes camera projection only, with no pixel-size compensation or upper-zoom scale cap. Carriage spacing uses the same scale. Nearby landmark overlap is culled with the selected station first; at most 40 visible items render. Station coordinates remain from the normalized contracts, while sign bearing, platform form and dimensions are schematic.
- LRT track assembly now joins connected ways at both ends and rejects disconnected chains. The checked-in geometry was rebuilt from three OSM relations, trimmed at terminal stops, and preserves per-line interchange coordinates. Station-to-track regression checks pass. `docs/qa/resident-workspace/lrt-geometry.json` records provenance.
- Old hidden MLM announcements are collapsed as history; CST dates are parsed as UTC+08:00. The publisher display flag does not prove an ongoing disruption.
- The polished models use three-segment bevels, smooth normals, denser circles, roof vents, wheel bolts, brighter paint and soft contact shadows.
- The custom layer uses Float64-composed transforms and shared geometry. Internal model depth testing is enabled; terrain depth is cleared before the model pass. Coarse pointers cap bus motion at 30 updates/s, other pointers at 60. Reduced motion uses stationary official bus estimates and a stationary labelled LRT example.
- The map allows zoom up to 24 while model screen size remains readable; MapLibre does not provide infinite zoom.
- The LRT line uses a rounded Blender carriage instantiated twice. Each carriage samples its own track position and heading, so the set bends along the rail; the rear outer cab faces back. The flat fallback also articulates. This remains a labelled schematic animation (ADR 0008), not live train location.

- The route `routeChange` flag is not used for badges because it covers most routes; diversions come from the suspended-stop message feed.
- LRT has the same selection flow as buses: pick a line, see its stations highlighted on the map and listed with interchange badges. It shows the official fixed network and service notices, plus the labelled schematic train animation; no live positions are claimed.
- The UI does not use a hero page or feature marketing copy.
- The AI assistant answers in the selected locale and is grounded in a JSON snapshot of the normalized live data. A bus route named in the question is fetched live (full stop list, vehicle plates, approaching stops, stops-away counts, per-segment traffic; both directions for a single route), a named road is matched against the monitored segments with a status breakdown, and the official LRT network (lines, stations, interchanges) is included with the statement that this app has no verified official live train positions. Route place questions are verified against the official stop list and the verified yes or no leads the answer. The prompt requires the snapshot time, an explanation with a next check or a small follow-up task, no invented destinations, and no personal data. The panel shows the snapshot time and the list of data that grounded the answer. The snapshot includes government RSS titles/dates, feed availability and source freshness. The prompt forbids treating published news as a complete incident feed or converting border status to minutes.
- Assistant answers can carry a UI action: a named bus route is drawn on the map with its stops and live vehicles while the answer stays visible, a named LRT line is highlighted, and a button in the answer opens the matching bus or LRT panel.
- Assistant replies are not cached and questions are not stored. The provider key stays server-side; without `ASSISTANT_API_KEY` the assistant endpoint returns 503 and the rest of the app is unaffected.

## Known Risks

- The local AI key is absent. The user selected the existing DeepSeek configuration; provider defaults are retained, but real AI answer generation remains unverified locally until a server-side key is configured. Fixtures verify the homepage-to-answer flow.
- Live verification on 2026-11-10 failed for parking and the old DSAT announcement pages with Node `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. GCS RSS worked; DSAT RSS was individually unavailable to Node. TLS validation was retained. Production availability must be checked separately before release.
- RSS publication lag and finite item windows remain unknown; the app cannot promise incident completeness or ongoing-event status.
- Native mobile applications and physical-device frame-rate/battery measurements are outside this web revision. Chromium touch emulation is not a physical iOS Safari test.
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

- Build a reliable all-network stop index before adding cross-route nearby-stop search or journey planning. Nearby parking is already browser-only.
- Obtain a reusable incident feed with event identity, update/resolution fields and publication-delay measurements before promising incident alerts.
- Validate the resident revision on physical touch devices and verify production source certificates before deployment.
- Add a source-history dashboard after a decision to store time-series data.
- Revisit LRT live arrivals only if MLM or DSAT publishes a stable official API.
- Map `busType` to model variants only if DSAT publishes a stable type-to-vehicle mapping.
- Add visual regression baselines when the layout is stable.
