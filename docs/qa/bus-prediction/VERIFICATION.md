# Bus arrival prediction verification

Date: 2026-11-15

Render deployment `dep-dbskfck9v7es73c192k0` is live with `d20426409399620d69c744d5c2813da5e888f4aa`. The public route 56 endpoint returned 3 vehicles and 23 stop estimates at 05:50:16 UTC. Desktop Chromium displayed the estimate and source time without page errors. A 390 px mobile browser displayed the estimate without horizontal overflow. Screenshots and normalized evidence are in this directory.

The isolated production checkout passed typecheck, lint, 210 unit tests and the Next production build. The broader browser run passed 61 tests and skipped 2; one existing geolocation test latched onto a hidden outgoing form during a transition. Its selector now targets the visible journey form. All 14 journey-map/prediction browser checks then passed on desktop/mobile Chromium. Following a UI-clock freshness adjustment, the final code repeated typecheck, lint, all 210 unit tests, build and both desktop/mobile prediction checks successfully.

Tests verify congestion effects, incoming/outgoing segment matching, speed zero, missing inputs, unchanged position expiry, observed-speed fallback, circular routing, disconnected geometry, suspended stops and old estimates. Browser tests verify labelled minutes and fallback to stop counts or suspension status. Map motion tests verify a 15-second horizon and next-stop cap.

The forecast has not been calibrated or measured against actual arrivals. Upstream coordinates are estimates, not measured GPS. The map's bounded prediction does not establish the vehicle's true position. See ADR 0020 for model assumptions. Physical-device motion and background-resume behaviour were not tested on an actual phone in this revision.
