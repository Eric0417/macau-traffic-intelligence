# Guided workspace verification, 2026-11-13

This local revision connects common natural-language trip requests to the existing browser journey planner, moves guidance beside the map, and repairs announcement retrieval. It has not been deployed to Render.

## Behaviour checked

- In the live Chrome preview, “我想去議事亭前地” requested an origin. “我而家喺媽閣廟” then resolved both places and produced walking and bus options. The right pane showed walking access, boarding, alighting and walking egress alongside the map.
- Fixture browser tests cover destination-first requests, origin follow-up, changing the destination without losing the origin, restoring both live legs after a bus-detail detour, unknown destinations, and a failed traffic answer after a selected journey. Local endpoint requests made zero assistant-provider calls. General answers remain a single current brief with source evidence.
- The assistant opens without a view-transition snapshot. Immediate typing during the previous transition could be lost. Other transitions retain scope, focus restoration, cancellation and reduced-motion coverage.
- Existing tests verify current Macau time on each search, night-service filtering, both transfer legs, missing geometry, suspended stops, saved stops, map/list focus, language, appearance and responsive widths.
- A clock-controlled browser test verifies announcement polling within 70 seconds and manual refresh. Requests still use the server's shared cache.

## Source verification

Node 22 reproduced `UNABLE_TO_VERIFY_LEAF_SIGNATURE` against the DSAT RSS. Supplying the issuer certificate verified against Node's trusted root fixed it without disabling TLS checks. The production standalone server returned 20 news items with both feeds available and 60 arrangements, `ttlSeconds: 60`, `stale: false`, at 2026-11-13 12:32 Macau time.

Both lists began with the November 11 publication about restoring traffic on 施督憲正街 on November 17. RSS descriptions now contain readable text, and older incident-keyword items no longer sort before newer arrangements. A live local `deepseek-chat` call also returned current retrieved announcement titles. After the context-selection fix, a fresh standalone process answered the publication-date question with HTTP 200 in 4.19 seconds and correctly gave November 11 in Macau time. The cold standalone check also exposed an unrelated LRT-network dependency delaying news answers. That read is now limited to explicit rail questions (ADR 0016), with two offline regressions. Provider snapshots serialize publication timestamps as UTC+08:00; an offline regression covers a Macau midnight date that was previously read as the preceding UTC date. Date-only arrangement publications omit the synthetic 00:00 time in both the UI and provider context.

Publication polling is not an immediate incident feed. Cache TTL and client polling can add roughly two minutes under normal conditions, with longer delays on failure. Publisher windows and update lag are outside the app's control. Bus arrival/stop slices still poll every two seconds while focused; suspended-stop messages retain their separate five-minute cache. The route and walking indices remain dated snapshots. An absent suspension flag does not prove that a stop is operating if the diversion source has failed.

## Presentation

Horizontal desktop navigation replaces the rail. White/navy surfaces and orange controls replace the green palette; the home page starts with a trip prompt and compact transport rows. The assistant has a map above a scrollable guidance pane on the right. Mobile keeps the list/map switch and bottom navigation. The live preview was checked at desktop and 390 × 844 sizes; automated layout checks include 320, 768 and 1440 px.

References: [Transit's desktop planner](https://help.transitapp.com/article/534-trip-planner-for-desktop) for pairing route options with map directions, and the existing local transport artwork. No remote UI assets were added.

`live-desktop-journey.jpg` shows the actual local standalone app and basemap. `desktop-journey.png` and `mobile-journey.png` are fixture-test captures with a mocked map style and deliberately limited test routes; they are not live-data evidence.

## Validation

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: 153 tests in 32 files passed.
- `npm run docs:check`: passed.
- `npm run build`: passed, including standalone asset preparation.
- `npx playwright test --workers=2 --max-failures=2` against the standalone build: 95 passed, one desktop touch-only case skipped. The final assistant navigation changes also passed all four desktop/mobile journey cases.
- `git diff --check`: passed.

Local preview: `http://localhost:3100`, started with `HOSTNAME=localhost PORT=3100 node --env-file=.env.local .next/standalone/server.js`. This is a running local production build; it does not hot-reload source edits. The local environment file is loaded explicitly for the standalone server; otherwise its general assistant endpoint is unconfigured. Deployment uses server environment variables.
