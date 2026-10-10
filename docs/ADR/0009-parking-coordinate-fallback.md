# ADR 0009: Parking Coordinates Fall Back To The Macau GIS Carpark Layer

## Status

Accepted

## Context

`data/parking-locations.json` matched 78 of the 92 DSAT public car parks to OpenStreetMap `amenity=parking` features by name. The remaining 14 had no OSM name match, so the map marked them 未定位 and they could not be selected even though DSAT publishes their addresses.

The Macau SAR Government WebMap service (DSSCU) publishes a Carpark POI layer with official Chinese, Portuguese, and English names and WGS84 coordinates. All 14 car parks appear in that layer.

## Decision

`npm run build:parking` keeps OpenStreetMap as the primary match. When a DSAT car park has no OSM name match, the build queries the DSSCU WebMap Carpark POI layer (`MacauMap_{P,T,S}_POI`, layer 8) with `outSR=4326` and matches by name. The resulting coordinates are checked into `data/parking-locations.json`; the runtime never calls the GIS service.

OpenStreetMap entries keep ODbL. The file records the mixed source and the government GIS data remains subject to its publisher's terms. `docs/DATA_SOURCES.md` carries the attribution.

## Consequences

- All 92 DSAT car parks have a map position. The 未定位 state stays in the UI for any future car park that neither source can match.
- The build now depends on the DSSCU WebMap service in addition to Overpass. A failed query aborts the build instead of writing a partial file.
- Coordinates for the 14 fallback car parks come from the government GIS layer, not from a hand-entered or estimated position.
- The runtime cache, public API contract, and parking occupancy source are unchanged.
