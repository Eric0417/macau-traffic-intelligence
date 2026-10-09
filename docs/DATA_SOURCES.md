# Data Sources

This registry is part of the implementation contract. Any source, field, TTL, fallback, or attribution change must update this file and its tests in the same change.

| Source id | Publisher | Runtime endpoint or page | Refresh | Cache / stale | Fallback |
| --- | --- | --- | --- | --- | --- |
| `roads` | DSAT / DSSCU | `https://bis.dsat.gov.mo/api/Service/RoadTrafficSimpleGraph_Road` | 60 s | 60 s / 15 min | Last valid GeoJSON with `stale: true` |
| `bridges` | DSAT / DSSCU | `https://bis.dsat.gov.mo/api/Service/RoadTrafficSimpleGraph_BridTime` | 60 s | 60 s / 15 min | Last valid bridge values |
| `cameras` | DSAT | `https://bis.dsat.gov.mo:37812/ddbus/common/supermap/traffic/video` | 6 h catalog | 6 h / 7 days | Cached catalog and direct official HLS |
| `bus-routes` | DSAT | `https://bis.dsat.gov.mo:37812/macauweb/getRouteAndCompanyList.html` plus the official route page `https://www.dsat.gov.mo/dsat/bus_route.aspx` | 6 h | 6 h / 1 day | Cached route catalog; the route page only fills seasonal routes the arrival system omits |
| `bus-eta-{code}-{direction}` | DSAT | `https://bis.dsat.gov.mo:37812/ddbus/app/passenger/route` (arrivals), `.../macauweb/routestation/bus` (live buses), `.../macauweb/routestation/location` (stop coordinates), `.../ddbus/common/supermap/route/traffic` (official polyline and per-segment traffic) | 10 s | 10 s / 60 s | Last arrivals, vehicles, and geometry while stale; each call degrades independently |
| `bus-diversion-{routeName}` | DSAT | `https://bis.dsat.gov.mo:37812/macauweb/getRouteChangeMessage.html` | 5 min | 5 min / 1 h | Last known suspended-stop list; failures leave the route unflagged |
| `parking` | DSAT | `https://www.dsat.gov.mo/dsat/carpark_realtime_core.aspx?lang=tc` | 30 s | 30 s / 5 min | Last parsed occupancy |
| `weather` | SMG | Official RSS: `ActualWeather`, `WSignal`, `WForecast` | 60 s | 60 s / 30 min | Last weather and warnings |
| `notices` | DSAT | `emergency.aspx`, `croad.aspx`, `bus_croad.aspx` | 5 min | 5 min / 1 day | Last notice list |
| `lrt-network` | MLM / OpenStreetMap | `https://overpass-api.de/api/interpreter` route relations and stop nodes, with official names from the checked-in network | 6 h | 6 h / 30 days | Last valid network; checked-in `data/lrt-network.json` |
| `lrt-notices` | MLM | `https://www.mlm.com.mo/rss/tc/notice.rss` | 5 min | 5 min / 1 day | Last official notice list |
| `borders` | Public Security Police Force | `https://www.fsm.gov.mo/psp/pspmonitor/webservice.asmx/getStatus` | 60 s | 60 s / 30 min | Last valid values or official page link |
| `assistant` | LLM provider, OpenAI-compatible (default DeepSeek) | `POST {ASSISTANT_BASE_URL}/chat/completions` | Per question, no reuse | No cache | Route answers 503; every other source keeps serving |

## Licensing And Attribution

- Application code is MIT licensed.
- DSAT, SMG, MLM, FSM, and OpenStreetMap data remain subject to their publishers' terms.
- OpenStreetMap-derived LRT geometry requires ODbL attribution.
- Camera streams are played directly from the publisher and are never recorded or re-hosted.
- Assistant answers are generated text from the configured provider. The app attributes the model in the response meta and stores neither questions nor answers.
- The public API exposes normalized live views only, not bulk history or original datasets.

## Adapter Notes

- `cameras`: the official catalog repeats some border cameras once per zone under a shared numeric id. The adapter keeps every zoned entry, drops byte-identical repeats, and appends a short deterministic suffix to colliding ids so map features, list keys, and camera selection stay stable.
- `lrt-network`: the server rebuilds the network from OpenStreetMap route relations every 6 hours. Lines are grouped by `ref`; stations are merged by name and proximity under 400 m, so 協和醫院 and 蓮花 stay interchanges. Known stations keep the curated official names and ids from `data/lrt-network.json`; new stations use the OSM name tags. Overpass endpoints are tried in order (`LRT_OVERPASS_URL` overrides them), and failures or a result with fewer than 3 lines or 15 stations fall back to the checked-in file. `npm run build:lrt` refreshes that file with the same builder.
- `roads`: DSAT publishes live levels for 1,268 monitored segments only. The map draws the full OpenStreetMap street network in grey underneath, and no status is claimed for roads outside the official set.
- `bus-routes`: the arrival system lists 97 routes and omits seasonal services. The official route page adds them (currently `3AS`, `17S1`, `26S`, `52S`) and they are returned with `live: false`.
- `bus-routes`: the catalog is fetched from DSAT at runtime every 6 hours. A new route appears without a redeploy; the cache keeps the previous list while the refresh runs.
- `bus-routes`: the official `routeChange` flag is set for 50 of 97 routes and the message endpoint answers `routeChange: true` for routes without suspended stops, so the UI no longer badges that flag. Diversions are shown only when `bus-diversion-{routeName}` reports suspended stops.
- `bus-eta-{code}-{direction}`: DSAT reports buses per station segment, not raw GPS. Stops are merged by `stationCode`, and a live vehicle is matched to the stop named by the feed's `staCode`. Its position is estimated along the official polyline using the stop ETA, with `estimated: true`; buses approaching the same stop are spread along that segment so they do not share one point.
- `bus-eta-{code}-{direction}`: The official map page draws `route/traffic` as one polyline per stop-to-stop segment. Each returned segment carries `fromStationCode` and `toStationCode`, and its traffic level (1 normal, 2 slow, 3 congested, 4 very congested, -1 unknown) feeds the route line and stop badges. Invalid segments are omitted without shifting later pairings.
- `bus-eta-{code}-{direction}`: The upstream `busType` value is exposed on each vehicle. It is descriptive only; the model does not claim a brand or vehicle type.
- The map ground is flat. The optional 3D view tilts the camera and shows extruded buildings from the OpenFreeMap vector tiles; no terrain elevation source is loaded, so roads stay level.
- Bus models are generic two-axle Blender 5.2 models. The source is `docs/models/bus-models.blend`; runtime exports are `public/models/bus-tcm.glb` and `public/models/bus-transmac.glb`. MapLibre renders them in a custom WebGL layer from z17. They use true meter scale through z19, then keep a fixed on-screen size so they stay readable without covering the map. Lower zooms use a marker and plate label. The UI states that the bus model is generic, not brand-specific.
- `assistant`: the server assembles a compact JSON snapshot from the cached normalized contracts (roads with congested, slow, and question-matched segments; bridges; weather; parking; borders; notices; LRT notices) and adds live bus detail when the question names a route or a route is focused in the app: both directions for a single named route, capped at three route-direction slices, each with vehicles, approaching stops, next arrivals, suspended stops, and per-segment traffic. Raw upstream payloads are never forwarded; vehicle positions are the arrival feed's estimated segment positions, never presented as GPS. The prompt fixes the explanation format, the locale, the snapshot citation, and the no-personal-data rule; `assistantConfigured()` disables the route when `SOURCE_ASSISTANT_ENABLED=false` or `ASSISTANT_API_KEY` is missing. Provider configuration is `ASSISTANT_API_KEY`, `ASSISTANT_BASE_URL`, `ASSISTANT_MODEL`, `ASSISTANT_TIMEOUT_MS`, and `ASSISTANT_RATE_LIMIT_PER_MINUTE`; the key stays server-side. The default provider is DeepSeek; a local OpenAI-compatible server such as Ollama can be used for offline demonstrations.

## Reference Material Not Used

`bus_route/` is local reference material and is not committed (see `.gitignore`).

- `route_list.json` duplicates the live `getRouteAndCompanyList.html` response.
- `routes.json` is text extracted from the official route PDFs. Stop names are garbled by the PDF layout, there is no geometry, and 1 of 91 routes failed to parse, so it is not a reliable source.
- `stops.json` holds official Macau GIS bus-stop coordinates, but the live `routestation/location` endpoint already returns per-route stop coordinates in route order.
- The PDFs are raster route maps, so they cannot provide the official route alignment as coordinates.
