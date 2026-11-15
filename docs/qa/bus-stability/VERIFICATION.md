# Bus prediction stability verification

Date: 2026-11-15

## Reproduction and fixes

A 40-response route 56 recording (06:00:40–06:02:38 UTC) showed C690/6 estimates changing from 13 to 38 and back to 11 minutes as the nearest vehicle's position became stale and the estimator selected another bus. Vehicle AA6356 reverted from segment 15 to segment 14 after its forecast expired. The normalized geometry and vehicle reports are retained in `tests/fixtures/bus-route56-sequence.json`; forecast fields were removed and the source stop-based indices reconstructed for replay.

Before the correction, regression tests reproduced six failures: silent replacement of a stopped nearest bus, stale outgoing-segment reversion, a single speed drop changing 2 minutes to 34, premature passage from stop-boundary jitter, reverse map movement, and a source index mismatch after zero-length geometry. Two further tests exposed coasting past a frozen target and loss of lap continuity during repeated polls. These tests pass with the fixes.

The replay checks nondecreasing accepted progress and displayed motion, at most two minutes of change between successive same-arrival estimates in this recording, uncertainty states and explicit replacement labels. The two-minute assertion describes this recording, not a universal accuracy or update bound.

## Checks

The isolated checkout at `8f34615` passed type generation, `npm run typecheck`, `npm run lint`, `npm test` (226 tests across 39 files), and `npm run build`.

Twenty-two Playwright checks passed against that production build on port 3102, with public APIs and map styles mocked: bus prediction states, journey map/data freshness, traffic layers and 3D-model fallback, on desktop and phone Chromium. Screenshots in this folder show the updating state and were visually checked for clipping. A separate model reviewed prediction, motion and contract changes and found no blocking issue. No graph tools were available; review used exact source and tests.

## Limits

Minute predictions have not been calibrated against buses observed arriving at stops. Upstream positions are estimates without vehicle measurement timestamps. The UI shows uncertainty when a nearest vehicle cannot be timed; it does not assert that no bus exists. Small trailing corrections freeze the marker until accepted forward progress catches up. A new tracking session after a long gap can reposition the marker without animating an invented trip. See ADR 0021 for matching tolerances and filter parameters.

## Render verification

Deployment `dep-dbsksue7bikc73f6o13g` is live at commit `8f34615c743ec835c3b6a80735be44d69633e8d3` on https://macau-traffic-intelligence.onrender.com.

Deliberate live probes read 16 snapshots each from route 56 direction 0, route 25 direction 0 and route 3 direction 1 (48 responses in total, updated between 06:19:15 and 06:20:13 UTC). Every route returned tracking and arrival estimates. The samples contained zero backward accepted-progress changes, zero unlabelled vehicle replacements and no request failures. Counts are retained in `live-summary.json`; they are observations over this interval, not a continuous monitoring guarantee.

The public site rendered the route 56 updating state on 1440 px desktop and 390 px phone viewports, with no document overflow or page JavaScript errors. Both responses contained four tracked vehicles. Screenshots and `browser-summary.json` are retained here. Two initial browser attempts timed out waiting for the route catalogue/ETA request; retry completed without code changes. The live API sequence itself had no failed responses.

A subsequent public-site check selected a stop with available minutes: route 56 showed approximately 7 minutes on desktop and 6 minutes on phone, both labelled system estimates, with four tracked vehicles, no page errors and no document overflow. `production-desktop.png` and `production-phone.png` show this later check; the mocked updating-state screenshots remain separate. These are successive live observations, not synchronized device comparisons.
