# Macao Move native verification

Checked on 2026-11-16. Build 1.0.0 (4), bundle `com.eric.macautraffic`, minimum iOS 26. Xcode 27.2. Build 3 was rejected after physical use: its earlier fixture tests missed repeated location, camera continuity, full-size traffic overlays and route application. This report describes the replacement and its specific checks.

## Reported interactions

- Location: real CoreLocation simulator updates at a specified Macau coordinate; pan away and recenter twice. Unit tests also cover stale fixes, temporary `locationUnknown`, cancellation and timeout.
- 3D: toggle after a pan while retaining center, distance and heading; the button reports the current camera perspective. Tests compare actual MKMapView values.
- Traffic: retain all 1,268 road segments and 5,095 vertices from a captured normalized response, grouped into at most four renderers. Refresh-delay labels advance even if a network request stalls.
- Applying a route: return to Explore, clear the previous navigation path/live-state owner, and fit only the route. Both endpoints remain inside the usable map area above the home panel. Open details, drag down to dismiss, and keep the underlying map. Native edge-back navigation is tested separately.
- Voice: actual AVAudioRecorder power feeds a bounded scrolling waveform. Stop produces an editable mocked transcript in UI tests; cancel and microphone buttons work near their hit-area edges. The enabled send control is white in both appearances.
- Assistant: checked candidates arrive before model comparison. Stream/JSON compatibility, arbitrary byte chunks, explicit failure, interrupted streams, cancellation and old-itinerary cleanup have tests. Provider aborts propagate through interpretation, nearby searches and itinerary planning. Candidate cancellation preserves source refresh scheduling and prevents another diversion round.

## Automated results

- Repository typecheck, lint, 41 files / 255 tests and production build passed. Source documentation checks passed. Production dependency audit found zero high/critical findings and one low finding.
- iPhone 17 Pro simulator, iOS 26.5: 30 unit tests and all 15 UI flows passed in the 03:03 run. An additional endpoint-visibility regression passed after the final map inset correction. The final native unit rerun is recorded with the release receipt below.
- Six UI flows passed again after large-type, map attribution and settings-navigation corrections. The route-to-home flow passed again after removing duplicate map insets.
- iPad Pro 11-inch simulator, iOS 26.5: assistant route-to-home/details, city parking/LRT and settings flows passed.
- The independent review findings were fixed: stale route state on reapplication, future journeys using current estimates, traffic included in route bounds, stale delay labels, preview row identity, obsolete itinerary context, stream cancellation, facility error handling and expired concurrent bus snapshots.

Result bundles are local under `ios/build/Logs/Test/` and `ios/build-ipad/Logs/Test/`. Full phone run: `2026.11.16_03-03-13`; six-flow rerun: `03-09-02`; final map regression: `03-11-49`; iPad run: `03-06-17`. Generated result bundles are excluded from git.

## Measured performance

With the same captured traffic response and three iterations of traffic on, map pan, two perspective toggles and traffic off, app CPU time fell from 1.726 s to 1.275 s (26%). Wall time including UI automation fell from 5.734 s to 5.510 s. These are simulator measurements, not physical frame-rate or battery measurements.

A public journey request against the previous production API took 21.765 s. A local built-server HTTP stream returned candidates in 2.024 s and the final three options in 3.613 s; see [local stream check](stream-local-check.json). The environments and cache states differ, so this is not a controlled production speed comparison. First-candidate and final timings must be kept separate.

## Deployment and installation

The Build 4 release build passed. Deployment and final device installation are pending verification. The prior production rollback point is commit `826afc240d6441891ea35d0d5f9a99c70c1187f0`, Render deployment `dep-dbstuotckfvc73e1iq00`.

Build 3 was installed over USB and the user reported physical interaction failures. This host's CoreDevice tunnel and debugserver were unavailable; libimobiledevice supported installation. No physical Build 4 launch, field GPS accuracy, microphone transcription quality, camera playback, frame pacing or battery measurement is claimed by simulator checks. TestFlight and App Store distribution are separate.

## Screenshots

Actual simulator captures use dated or explicitly synthetic fixture responses and a MapKit basemap. They do not establish live transport accuracy.

- [Explore](explore-zh.png), [assistant](assistant-zh.png), [city](city-zh.png), [bus cards](buses.png).
- [Concise plan](assistant-plan.png), [home route](journey-home.png), [draggable details](journey.png).
- [Enabled send button](send-ready-dark.png), [voice waveform](voice-waveform.png), [dark assistant](assistant-dark.png).
- [Large assistant](assistant-large-text.png), [large city](city-large-text.png), [large bus cards](buses-large-text.png).
- [iPad assistant](ipad-assistant.png), [iPad details](ipad-journey.png).

## Data limits

Native vehicle pins use official reported estimates without the website's extrapolated 3D animation. Manual routing runs the shared TypeScript functions in JavaScriptCore. Dated walking geometry, source-dependent arrival estimates, unreviewed service hours and qualitative border status retain their existing limits. LRT positions are not live. Signing and backend/provider availability remain runtime dependencies.
