# Macao Move native verification

Latest revision: [Build 7 verification and device installation](BUILD7.md). The results below record the preceding Build 6 work.

Checked on 2026-11-16. Build 1.0.0 (6), bundle `com.eric.macautraffic`, minimum iOS 26. Xcode 27.2. Build 3 was rejected after physical use: its earlier fixture tests missed repeated location, camera continuity, full-size traffic overlays and route application. Build 4 replaced those interactions; Builds 5–6 add shared routing optimizations with the same interface. This report describes the replacements and their specific checks.

## Reported interactions

- Location: real CoreLocation simulator updates at a specified Macau coordinate; pan away and recenter twice. Unit tests also cover stale fixes, temporary `locationUnknown`, cancellation and timeout.
- 3D: toggle after a pan while retaining center, distance and heading; the button reports the current camera perspective. Tests compare actual MKMapView values.
- Traffic: retain all 1,268 road segments and 5,095 vertices from a captured normalized response, grouped into at most four renderers. Refresh-delay labels advance even if a network request stalls.
- Applying a route: return to Explore, clear the previous navigation path/live-state owner, and fit only the route. Both endpoints remain inside the usable map area above the home panel. Open details, drag down to dismiss, and keep the underlying map. Native edge-back navigation is tested separately.
- Voice: actual AVAudioRecorder power feeds a bounded scrolling waveform. Stop produces an editable mocked transcript in UI tests; cancel and microphone buttons work near their hit-area edges. The enabled send control is white in both appearances.
- Assistant: checked candidates arrive before model comparison. Stream/JSON compatibility, arbitrary byte chunks, explicit failure, interrupted streams, cancellation and old-itinerary cleanup have tests. Provider aborts propagate through interpretation, nearby searches and itinerary planning. Candidate cancellation preserves source refresh scheduling and prevents another diversion round.

## Automated results

- Repository typecheck, lint, 41 files / 257 tests and production build passed after the routing performance follow-up. Source documentation checks passed. Production dependency audit found zero high/critical findings and one low finding.
- iPhone 17 Pro simulator, iOS 26.5: 30 unit tests and all 15 UI flows passed in the 03:03 run. An additional endpoint-visibility regression passed after the final map inset correction. All 31 native unit tests passed in the 03:12 run. All four JavaScriptCore planner tests passed again after reusing the numeric collator (03:31 run).
- Build 5 rerun (03:38): all 31 native unit tests and the complete assistant-to-home/details UI flow passed after indexing pedestrian edges. The Release build and strict signature verification passed.
- Build 6 rerun (03:46): all 31 native unit tests and the assistant-to-home/details flow passed after avoiding losing intermediate bus allocations. The final Release build, strict signature check, 257 repository tests, lint, typecheck and production build passed.
- Six UI flows passed again after large-type, map attribution and settings-navigation corrections. The route-to-home flow passed again after removing duplicate map insets.
- iPad Pro 11-inch simulator, iOS 26.5: assistant route-to-home/details, city parking/LRT and settings flows passed.
- The independent review findings were fixed: stale route state on reapplication, future journeys using current estimates, traffic included in route bounds, stale delay labels, preview row identity, obsolete itinerary context, stream cancellation, facility error handling and expired concurrent bus snapshots.

Result bundles are local under `ios/build/Logs/Test/` and `ios/build-ipad/Logs/Test/`. Full phone run: `2026.11.16_03-03-13`; six-flow rerun: `03-09-02`; final map regression: `03-11-49`; iPad run: `03-06-17`. Generated result bundles are excluded from git.

## Measured performance

With the same captured traffic response and three iterations of traffic on, map pan, two perspective toggles and traffic off, app CPU time fell from 1.726 s to 1.275 s (26%). Wall time including UI automation fell from 5.734 s to 5.510 s. These are simulator measurements, not physical frame-rate or battery measurements.

A public journey request against the previous production API took 21.765 s. A local built-server HTTP stream returned candidates in 2.024 s and the final three options in 3.613 s; see [local stream check](stream-local-check.json). The environments and cache states differ, so this is not a controlled production speed comparison. First-candidate and final timings must be kept separate.

The first production streaming deployment (`a5d1673`) still took 12.983 s to candidates and 14.865 s to final options using native URLSession, and 18–19 s to candidates in separate Node checks. See [native measurement](stream-production-native.json) and [Node measurement](stream-production-check.json). This did not meet the latency goal. Local CPU profiling identified repeated numeric-collation setup and routing work. Four full-snapshot day/night searches retain identical output hashes after reusing the collator; calculation time fell by 25–36% locally. See [before](routing-before.json), [after](routing-after.json), and `ios/scripts/benchmark-routing.ts`. Those offline cases exclude provider and suspension requests.

The first optimization (`7677f30`) reduced production first candidates to 5.852–7.365 s and final comparison to 7.377–8.740 s. Aggregate server timings showed 807–1,025 ms for walking setup, 3,815–4,571 ms for search (including target walking callbacks), and 4 ms for suspension checks. See [native check](stream-collator-native.json) and [Node check](stream-collator-check.json). This confirmed the remaining work was computation.

The spatial index retains the original snap bounds, edge order, direction and main-component preference. All 2,400 forward/reverse/offset walking queries matched the previous full path output exactly, with local time 1,388 → 167 ms. All four complete day/night journey outputs also match their original hashes; see [walking comparison](walking-index-check.json) and [indexed routing](routing-indexed.json). The current snapshot adds 911 index cells and 134,612 edge references. Actual iOS heap growth was not measured.

After indexing (`50cf7bb`), production candidates took 5.322–6.156 s and final comparison 6.780–7.981 s; see [native](stream-build5-native.json) and [Node](stream-build5-check.json). The remaining search stage took 2.9–3.2 s. Build 6 avoids allocating a strictly losing intermediate label, but still evaluates every complete candidate and equal-cost tie. An offline differential check covers 200 generated networks / 1,600 queries, including repeated stops, service windows, nearby coordinates and suspended stops; all full outputs match `50cf7bb`. See [comparison](routing-equivalence.json), `ios/scripts/check-routing-equivalence.mjs`, and the [final four-snapshot benchmark](routing-final.json). The same four full results retain their original hashes; local times are 89–180 ms versus the original 203–459 ms.

A separate production weather question returned a nonempty grounded assistant response in 2.844 s; see [general assistant check](general-assistant-production.json). This is one request, not a latency percentile.

Final production checks (`0c8af7a`): native URLSession returned candidates at 5.916 s and the final three choices at 7.356 s; the separate Node stream returned candidates at 5.961 s and final choices at 7.292 s. See [native](stream-final-native.json), [Node](stream-final-check.json) and [server stage timings](stage-timing-final.json). Both use the same public Senado Square → Panda Pavilion question as the earlier checks, with no personal location. The final allocation change's extra production gain over Build 5 is not established by these two requests, although its offline computations are faster. These are individual observations with changing server load, not p95 measurements or a guarantee for every question.

## Deployment and installation

The Build 4 release build and strict code-signature verification passed. USB installation returned `InstallComplete`; a separate installed-app query confirmed `Macao Move`, version `1.0.0`, build `4`. Package: `ios/build-device/MacaoMove-build4.ipa`, SHA-256 `091f7c0d1d97978477020d2d2f936b4655ccd0ad648a5b1f8145c2db81c41b0b`. The development profile expires on 2026-11-23 at 01:56 Macau time.

Build 5 was installed over USB on November 16; a separate device query confirmed `Macao Move`, version `1.0.0`, build `5`. Package: `ios/build-device/MacaoMove-build5.ipa`, SHA-256 `7dafbf2bb919d7b2d3b6eb71afdc40f9352e85c53d58543ccd395ce6356b6a52`. The profile has the same expiry. [Installed version](installed-build5.json).

The final Build 6 package also returned `InstallComplete`; the separate device query confirms `Macao Move`, version `1.0.0`, build `6`. Package: `ios/build-device/MacaoMove-build6.ipa`, SHA-256 `1682da2a6653a0ce8542aafc47acecc1edb8be1a3cb3aa9a50bea64372c89d13`. [Installed version](installed-build6.json). Development signing still expires on November 23 at 01:56 Macau time.

The final Render deployment is `dep-dbt0opbl550s739nc3t0`, code commit `0c8af7a8139e6e14d43ef7f821ea7a34ae0b9bf0`, live at 2026-11-16 03:49 Macau time. Production JSON and NDJSON contracts passed, including native Codable decoding. Health reported Redis and no recorded failures in the 14 listed sources. The first streaming release was `a5d1673` / `dep-dbt09q3bc2fs73coiav0`; the pre-native backend rollback point is `826afc240d6441891ea35d0d5f9a99c70c1187f0` / `dep-dbstuotckfvc73e1iq00`.

Build 3 was installed over USB and the user reported physical interaction failures. This host's CoreDevice tunnel and debugserver were unavailable; libimobiledevice supported installation. No physical Build 6 launch, field GPS accuracy, microphone transcription quality, camera playback, frame pacing or battery measurement is claimed by simulator checks. TestFlight and App Store distribution are separate.

## Screenshots

Actual Build 4 simulator captures use dated or explicitly synthetic fixture responses and a MapKit basemap. Build 6 has the same layout. They do not establish live transport accuracy.

- [Explore](explore-zh.png), [assistant](assistant-zh.png), [city](city-zh.png), [bus cards](buses.png).
- [Concise plan](assistant-plan.png), [home route](journey-home.png), [draggable details](journey.png).
- [Enabled send button](send-ready-dark.png), [voice waveform](voice-waveform.png), [dark assistant](assistant-dark.png).
- [Large assistant](assistant-large-text.png), [large city](city-large-text.png), [large bus cards](buses-large-text.png).
- [iPad assistant](ipad-assistant.png), [iPad details](ipad-journey.png).

## Data limits

Native vehicle pins use official reported estimates without the website's extrapolated 3D animation. Manual routing runs the shared TypeScript functions in JavaScriptCore. Dated walking geometry, source-dependent arrival estimates, unreviewed service hours and qualitative border status retain their existing limits. LRT positions are not live. Signing and backend/provider availability remain runtime dependencies.
