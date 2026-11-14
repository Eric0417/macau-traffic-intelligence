# Phone layout verification

Date: 2026-11-14. Branch: `codex/mobile-layout`.

## Reproduction

The user reported cards cropped on the right in iPhone Safari. At a 320px viewport, Playwright WebKit measured a 296px home grid with 491px children. The page itself had no horizontal scrollbar because the list hid overflow. Chromium did not reproduce this width error. `webkit-before.png` records the failing state.

The grid now has an explicit `minmax(0, 1fr)` column and shrinkable children. The home question form reserves 44px for its send button. Phone spacing, example buttons, transport rows and assistant input use the available width. Day-trip inputs use 16px type; time fields stack below 360px.

WebKit also inserted a space into the localized home date that Node omitted. A text-only hydration warning override on that date avoids replacing the rendered page. The browser regression captures uncaught page errors.

## Checks

- Focused layout suite: six passed across mobile Chromium and WebKit. Tests cover 320/390/430px, Traditional Chinese, Simplified Chinese and English, all primary tabs, scroll access above the bottom navigation and day-trip date/time/text fields.
- Tests check inner card/control bounds and scroll widths, so hidden overflow cannot make the regression pass.
- Browser fixtures mock public APIs and the map style. Screenshots: `webkit-home-light.png`, `webkit-home-dark.png` and `webkit-day-trip.png`.
- Typecheck, lint, all 173 unit/parser tests, documentation checks and production build passed.
- Full browser suite: 114 passed, five platform-specific skips. Existing desktop guidance, multi-stop/day-trip flows, mobile map switching and touch scrolling passed.
- Independent source/test review found no blocking issues.

These are simulated mobile browser checks. Physical iPhone Safari browser chrome, safe-area insets and the native keyboard have not been tested on a connected phone.

## Deployment

Render deployed `414b9f494be13953cc2df77d87e0a91395ddd69f` as `dep-dbs4mc68bjmc73e49ht0`, live at 2026-11-14 11:52:23 UTC. The public health endpoint returned `ok` with Redis; see `render-health.json`.

Chrome production checks at 320/390/430px found no inner overflow in the home cards, question form or suggestion buttons. The send button remained 44×44px at every width. `render-layout.json` records the measurements; `render-home.jpg` is the 390px production screenshot. A real request for `幫我安排澳門傳統文化一日遊` opened the details form. All date/time/text fields stayed inside the phone viewport with 16px text. No console errors were captured. Temporary viewport and language settings were restored after testing.

Rollback target: `0928d2cf72dbdaf0f9d75919719594017c40debc`, deployment `dep-dbs335ijnfac73bqfpv0`. No data migration or source contract changes.
