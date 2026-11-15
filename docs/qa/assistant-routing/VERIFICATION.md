# Assistant transport and nearby queries, 2026-11-15

## Reproduction

The live application classified `石排灣有咩巴士去？` as `traffic`. Its general snapshot had the 90-route catalogue but no selected route details. The resulting answer said Seac Pai Van route/stop data was not loaded. A direct journey request with the same site's normalized network returned route 56 from Pui Ching to Seac Pai Van. This reproduced a request-classification/data-context failure, not a network-wide bus-feed outage.

Two fixture regressions also failed before the fix: six shorter transfer choices could remove every direct option; filtering six suspended choices after truncation did not search for a seventh usable bus. The revised search keeps a direct comparison and excludes suspended stops before selecting candidates.

The DSAT parking response for facility 6045 on November 15 used the ordinary car icon for `塔石廣場地下上落客區(重型客車)`, with count 7. The parser previously labelled that count as light-vehicle spaces. A fixture reproduces this; heavy-only facility names now prevent that interpretation. The unclassified count is not reassigned to an assumed vehicle size.

## Verification

- TypeScript and ESLint pass. Production build and standalone packaging pass.
- 186 unit/parser tests pass without government-network calls, including the checked-in Pui Ching to Seac Pai Van topology, suspended-route refill, later daytime sections, invalid model selections and nearby parking availability semantics.
- Targeted Chromium end-to-end tests: 19 pass, one desktop-only case is skipped on mobile. API responses and map styles are mocked. They cover location permission/recovery, place choices, complete bus steps, collapsed secondary connections and day-trip edits.
- `npm run docs:check` passes.
- Local requests using the configured real provider now route the original Seac Pai Van question to place confirmation. An ordered Pui Ching → Seac Pai Van → Macau Stadium request recommends 56 followed by H3, each from the dated network. `local-live-evidence.json` records these synthetic public-landmark probes.
- A local nearby-parking request returned actual named facilities, distances and vehicle-specific counts with a timestamp. The nearby answer is rendered in the main panel. Saved screenshots use fixtures and demonstrate layout, not current parking availability.

## Limits

The original walking-only input's starting point was not provided, so that exact trip could not be reproduced. The regression tests cover the demonstrated candidate-loss bug, and the public-landmark route probe finds buses. Route topology and pedestrian paths remain dated; unreviewed service hours, transport times and later live availability remain unknown. Nearby results are bounded geographic searches, not a complete facility directory. No physical iPhone test was performed.

## Deployment

Deployment verification is recorded after the Render rollout completes.
