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
| `lrt-network` | MLM / OpenStreetMap | Official route pages plus OSM ODbL geometry | 24 h static | 24 h / 30 days | Versioned `data/lrt-network.json` |
| `lrt-notices` | MLM | `https://www.mlm.com.mo/rss/tc/notice.rss` | 5 min | 5 min / 1 day | Last official notice list |
| `borders` | Public Security Police Force | `https://www.fsm.gov.mo/psp/pspmonitor/webservice.asmx/getStatus` | 60 s | 60 s / 30 min | Last valid values or official page link |

## Licensing And Attribution

- Application code is MIT licensed.
- DSAT, SMG, MLM, FSM, and OpenStreetMap data remain subject to their publishers' terms.
- OpenStreetMap-derived LRT geometry requires ODbL attribution.
- Camera streams are played directly from the publisher and are never recorded or re-hosted.
- The public API exposes normalized live views only, not bulk history or original datasets.

## Adapter Notes

- `cameras`: the official catalog repeats some border cameras once per zone under a shared numeric id. The adapter keeps every zoned entry, drops byte-identical repeats, and appends a short deterministic suffix to colliding ids so map features, list keys, and camera selection stay stable.
- `roads`: DSAT publishes live levels for 1,268 monitored segments only. The map draws the full OpenStreetMap street network in grey underneath, and no status is claimed for roads outside the official set.
- `bus-routes`: the arrival system lists 97 routes and omits seasonal services. The official route page adds them (currently `3AS`, `17S1`, `26S`, `52S`) and they are returned with `live: false`.
- `bus-routes`: the official `routeChange` flag is set for 50 of 97 routes and the message endpoint answers `routeChange: true` for routes without suspended stops, so the UI no longer badges that flag. Diversions are shown only when `bus-diversion-{routeName}` reports suspended stops.
- `bus-eta-{code}-{direction}`: DSAT reports buses per station segment, not raw GPS. Vehicle markers are estimated at the midpoint of the official polyline for the segment before the approaching stop, with `estimated: true` and a bearing for the 3D icon.
- `bus-eta-{code}-{direction}`: The official map page draws `route/traffic` as one polyline per stop-to-stop segment. The adapter uses that geometry and its traffic level (1 normal, 2 slow, 3 congested, 4 very congested, -1 unknown) for the route line and stop badges, so the drawn path is the official alignment rather than a stop-to-stop straight line.
- Map terrain uses the public AWS Open Data terrain tiles (`elevation-tiles-prod`, terrarium encoding) for the optional 3D view.
- 3D vehicle models are drawn from MapLibre extruded geometry generated in the browser. Livery colours and part layout come from the operators' published paint schemes (TCM orange body with white front and roof, Transmac yellow body with white front and blue stripe) and from the official Macau LRT "Ocean Cruiser" design (pale body, deep blue front, orange wave). The layout was modelled in Blender; previews are in `docs/models/`. Model scale is exaggerated for legibility and labelled in the UI.

## Reference Material Not Used

`bus_route/` is local reference material and is not committed (see `.gitignore`).

- `route_list.json` duplicates the live `getRouteAndCompanyList.html` response.
- `routes.json` is text extracted from the official route PDFs. Stop names are garbled by the PDF layout, there is no geometry, and 1 of 91 routes failed to parse, so it is not a reliable source.
- `stops.json` holds official Macau GIS bus-stop coordinates, but the live `routestation/location` endpoint already returns per-route stop coordinates in route order.
- The PDFs are raster route maps, so they cannot provide the official route alignment as coordinates.
