# Dated bus topology for local journey search

Date: 2026-11-10

Status: Accepted for the resident workspace revision.

The resident journey form needs an origin and a destination. Precise location must stay in browser memory. The official current point-to-point page uses a server request containing origin/destination coordinates; the older BRES page redirects and its remaining configuration references an internal environment. Neither is used as a private-location relay.

The first version builds a normalized, dated stop-order snapshot from the existing DSAT route catalog and each route's official `routestation/location` response. The explicit build command uses at most four concurrent reads. Ordinary page loads and journey searches make no per-route upstream requests. The checked-in snapshot is served by a server-only adapter through the existing shared cache. Its `fetchedAt` describes the build date; response metadata describes retrieval from that snapshot. Refreshing the shared cache does not make the topology newer.

The browser computes direct and at most one-transfer journeys. It uses published stop order, including repeated stops on loop routes, and never assumes a bus continues from the final listed stop into another trip. Transfers require the same exact station code. Location access and egress figures are straight-line distances, not walking routes or times. Station endpoints use the exact selected code by default. An explicit `includeNearbyStops` option includes every indexed platform within 500 metres of each selected station, with separate access and egress distances. Results sort by ridden stop edges, access/egress distance, then transfer count. Equivalent options with the same bus/direction combination keep only the first ranked boarding, alighting and transfer choice, so they do not crowd out other bus combinations. Each leg names the final published stop for its direction. Results do not claim current operation, service hours, fare, arrival time or the fastest option. The existing live bus view checks the chosen route and suspended stops separately.

Coverage records missing or partially loaded catalog routes. Failed directions are omitted, not inferred from the opposite direction. Seasonal routes without a verified ordered stop list are omitted. The explicit build command reports incomplete routes and replaces the checked-in file only when all requested directions succeeded. A valid older snapshot stays available if a refresh fails.

The snapshot needs a deliberate rebuild and review when official routes change. Runtime all-network polling and a verified walking network can be considered separately if this limitation becomes unacceptable.

The journey map checks each selected leg against the existing normalized live route API and draws only matching official segment chains. Its access links remain straight-line schematics. A user may explicitly open Google Maps walking directions; the visible action discloses endpoint sharing, and no external routing request occurs automatically. This does not add a walking-data adapter or transfer-network inference.
