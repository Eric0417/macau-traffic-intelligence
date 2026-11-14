# Itinerary verification

Date: 2026-11-14. Branch: `codex/multi-stop-itineraries`.

## Coverage

- Single-destination location requests and model-ranked routes retain the existing response format.
- Ordered requests preserve every destination and return visit. Tests cover manual location recovery, unknown places and missing connections.
- Day trips ask for details before choosing attractions. Tests cover weekly closures, required places, invalid IDs, distinct alternatives, user-supplied stays, fixed-order edits, repeated visits, opening/last-admission windows and planned service-hour checks without future claims from current diversions.
- Desktop and Chromium mobile fixtures cover day-trip forms, alternatives, the initially displayed plan's follow-up context, second-connection map guidance and editing. Public API routes and OpenFreeMap style are mocked.
- Independent review identified edit constraints, initial selection context, user stay duration and stale map state. These were fixed. A second review identified repeated fixed visits; a regression now covers separate stay lengths for repeat visits.

## Local results

- TypeScript and ESLint passed.
- 168 unit/parser tests passed on Next.js 16.4.6 and Zod 4.6.6.
- Full browser suite on Next.js 16.4.6: 107 passed, one desktop-only touch test skipped.
- Production build passed on Next.js 16.4.6.
- `local-live.json` records six deliberate live-provider checks: single destination, location continuation, school → stadium → A-Ma Temple, day-trip clarification, three cultural alternatives, and a natural-language stay edit. Public landmark coordinates were used, with no user location.
- Screenshots: `desktop-ordered.png`, `mobile-ordered.png`, `desktop-day-trip.png`, `mobile-day-trip.png`.

## Release checks

The pre-release audit found existing Next.js and Zod advisories. Next.js and its ESLint configuration were updated to 16.4.6 and Zod to 4.6.6. The runtime audit now reports zero critical/high/moderate findings and one low-severity `fast-xml-parser` finding. Render deployment and post-deploy verification are pending.

The rollback target is Render deployment `dep-dbrt8pe7bikc73eebflg`, commit `675d75f39e5d30e9a2a2561301b5ab0be1c3d4ca`. There is no data migration.

## Limits

Seven reviewed heritage places form the initial cultural catalogue. Snapshot refreshes are explicit. Public-holiday exceptions and temporary closures are not verified. Visit targets and stays are planning suggestions; reliable transport durations and future live arrivals are unavailable. Current bus information is labelled as lookup-time information. Physical iOS Safari testing remains outstanding.
