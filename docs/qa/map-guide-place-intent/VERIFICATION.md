# Map guidance and place intent verification

Date: 2026-11-14. Branch: `codex/map-guide-place-intent`.

## Reproduction and change

The desktop guide reserved 46% of the map area even before a route was chosen. The browser regression measured 279px at the standard desktop viewport. The revised idle strip is 76px; route guidance takes at most 34%/280px and collapses to 48px. The map canvas grows when guidance is collapsed. Existing mobile route guidance retains its larger reading area.

Literal search returned clarification for `媽角廟` and failed at the `培証` origin before considering later stops. The new interpretation call batches unmatched names and validates model suggestions against existing places. It never accepts invented coordinates or substitutes an unchecked place. A review found an unnecessary call for a known alias plus an unmatched alternate alias; a failing regression was added and the caller now uses its known match first.

## Verification

- Typecheck, lint, 173 unit/parser tests and the production build passed.
- Full browser suite: 108 passed, two platform-specific tests skipped. The new test checks idle height, expanded proportion, the larger map canvas after collapse, and keyboard expansion without losing route content.
- `local-live.json` records three successful real-provider requests: a natural-language temple typo, a directly submitted itinerary with mistyped origin/destination, and continuation after choosing the real temple. Final stops were school → A-Ma Temple → stadium. The original stop order remained intact.
- Independent review's alias-call finding was fixed and rechecked; no findings remain in its focused review.
- Automated source tests use fixtures; browser tests mock public routes and map styles. Live checks in `scripts/smoke-place-intent.mjs` use public landmark names.

Render deployed `0928d2cf72dbdaf0f9d75919719594017c40debc` as `dep-dbs335ijnfac73bqfpv0`, live at 2026-11-14 10:03:10 UTC. Health at 10:03:24 UTC reported `ok`, Redis and zero source failures. The three live-provider checks passed on Render in 1.7–2.7 seconds each; see `render-live.json`.

Chrome production verification submitted `由澳門培証中學去媽角，再去澳門運動場`. The page resolved the school, offered real A-Ma-area choices, and retained school → temple → stadium after choosing 媽閣廟. The first walking connection opened normally. In the 859px-high map stage, guidance measured 76px idle, 280px expanded and 48px collapsed; route geometry and markers remained visible after collapse. No console errors were captured. Metrics are in `render-layout.json`; screenshots are `render-idle.jpg`, `render-place-choice.jpg`, `render-expanded.jpg` and `render-collapsed.jpg`.

The rollback target is deployment `dep-dbs2malbedkc73bmr1n0`, code commit `5ec14f6bae51be4788af95ae718c664764908b11`. There is no data migration or source-policy change.
