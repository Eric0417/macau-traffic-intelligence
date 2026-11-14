# Card workspace verification, 2026-11-12

The local revision changes the workspace presentation and removes the journey departure-time input. It has not been deployed.

## Behaviour

Each search reads the browser clock in `Asia/Macau`. Results retain the search time; another submission reads it again. The regression uses 2026-11-11 18:00 UTC (02:00 Macau) and then 2026-11-12 01:00 UTC (09:00 Macau) without remounting the planner. The first search selects the fixture night bus and the second selects its daytime service.

The desktop rail uses a vertical tablist, Up/Down navigation and a two-dimensional selection indicator. Mobile retains a horizontal bottom tablist. Route details, map/list focus transfer, saved stops, reduced motion and the existing card transitions remain covered by the browser suite.

## Visual direction and checks

References: [Transit 6.0](https://blog.transitapp.com/six-o/) for transit card hierarchy and [Apple Maps](https://www.apple.com/maps/) for separate place controls and map content. The implementation uses existing components, Noto Sans TC and transit artwork. It adds no UI dependency or remote artwork.

The palette is teal and pale green, with white content cards and dark green navigation. A wide bus card precedes the smaller LRT and parking cards. Cards use 20–24 px corners, nested controls use smaller corners, and the map has its own 28 px frame. Mobile retains native scrolling and the map/list switch.

Screenshots from the local app:

- `desktop-home.jpg`: desktop home with the actual basemap.
- `mobile-home.jpg`: Traditional Chinese home at 390 × 844.
- `mobile-planner.jpg`: Traditional Chinese planner with the leave-now label.
- `mobile-planner-dark-en.jpg`: English planner in dark mode; long action labels wrap to separate full-width buttons.

The responsive check covered 320, 390, 768 and 1440 px widths, with no document overflow or page exceptions in the fixture preview. The in-app browser also confirmed the 320 px English planner: both action buttons fit within the viewport. These are browser checks, not physical-device results.

## Automated verification

- `npm run typecheck`: passed.
- `npm run lint`: passed without warnings.
- `npm test`: 30 files, 135 tests passed.
- `npx playwright test --workers=2`: 89 passed, one desktop case skipped because it tests a touch swipe.
- `npm run docs:check`: passed.
- `npm run build`: passed.

Browser tests mock public API routes and the OpenFreeMap style. The screenshots use the running local app; they record appearance, not a source-accuracy audit. No source adapter, cache policy or endpoint was changed by this revision.
