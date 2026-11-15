# Panda Pavilion routing repair, 2026-11-15

The exact reported coordinates near Pui Ching were replayed against the checked-in bus and pedestrian graphs. Before the fix, raw bus topology found routes but mapped endpoint filtering removed them all. C655 to the pavilion entrance was 1,762 m on the graph; every platform within the old 500 m radius had a graph path over the 1 km limit. Only the 12,211 m full walk remained for the model.

The OSM extract has explicitly unlocked gates in the park. The importer treated these as blocked. Rebuilding the same extract with the corrected gate rule adds three nodes and seven edges, and gives C655 a 430 m connection. Place records and mappedAt are unchanged. Locked, private, prohibited, conditional and unknown gate access remains blocked. The change does not assert that gates are currently open.

The endpoint search now covers 1 km and at most three transfers. Ranking balances stop edges, endpoint walking and transfers; its weights are not time estimates. The exact forward and reverse regression includes a direct route 25 with mapped access and egress below 1 km each. Additional fixtures verify a 900 m boarding walk, reject a walk above 1 km, find two/three transfers, reject four transfers and apply hours/suspensions to an intermediate leg.

Local checks: 192 unit/parser tests and two Python gate-policy tests pass. TypeScript and ESLint pass. Desktop and mobile Chromium tests verify all four distinct live-leg responses, four route steps and the separate taxi suggestion, with public APIs and map style mocked.

A local real-provider request at about 12:44 Macau returned route 56 from 俾利喇/高士德 to 蝴蝶谷大馬路總站, with 142 m mapped access and 980 m mapped egress. Alternatives used 56 followed by 21A or 25, with 320 m final access. A separate taxi suggestion made no fare, duration, availability or geometry claims. These are lookup observations, not confirmed future bus departures.

Release build, production verification and deployment status will be recorded after completion. Unrelated local map redesign files are excluded from this release.
