# Native iOS verification

Checked on 2026-11-16. Build 1.0.0 (3), bundle `com.eric.macautraffic`, minimum iOS 26. Xcode 27.2 built the simulator and development-signed device application. The native client uses the existing deployed backend; this change did not deploy the website.

## Automated checks

- `npm run typecheck`, `npm run lint`, `npm test`: passed, 41 test files and 247 tests. Generated native build folders are excluded from lint.
- `npm run docs:check`: passed for the existing source registry and engineering memory.
- iPhone 17 Pro simulator, iOS 26.5: 18 XCTest unit tests and 10 XCUITest flows passed. Coverage includes coordinates and null values, contract decoding, freshness/clock skew/suspensions, route changes that fail, request body privacy, rate limits, saved directions/stop occurrences, WAV bytes, shared JavaScriptCore routing, corrected snapshots and moved stops.
- Phone UI flows cover route search, stop details and saving, parking/LRT, typed-origin AI plans, journey detail presentation, unknown-place recovery, day-trip fields with English spaces, Chinese navigation, dark appearance, maximum accessibility text size and recording to an editable mocked transcript. The first microphone permission flow was retested after fixing its inactive-scene cancellation.
- iPad Pro 11-inch simulator, iOS 26.5: two additional flows passed for typed-origin AI plans/journey detail and city/parking/LRT. The tests account for the iPad's top tab controls.
- After the final moved-stop walking-section fix, all 18 native unit tests passed again. The final device build and strict code-signature verification passed.
- An independent source review found stale-direction data, misplaced walking links, vehicle snapshot mismatches and assistant continuation/presentation issues. These were corrected before installation. The review was not a physical usability or security audit.

Local result bundles are under `ios/build/Logs/Test/`: the full phone run started at 02:14:30, the iPad run at 02:16:30, and the final native-unit run followed the Build 3 fix. These generated bundles are excluded from git.

## Production and installation

[Native live check](native-live-check.json) records requests through the production Swift URLSession client and Codable models. It decoded 90 bus routes, 95 parking records, the LRT network and 24 route-56 stops. A synthetic journey from 關閘 to 大三巴牌坊 resolved catalogue choices and returned three plans. No personal position or audio was used. This was a point-in-time check, separate from fixture-only automated tests.

Build 3 was installed on the paired iPhone 17 Pro over USB. `ideviceinstaller` reported `InstallComplete (100%)`; querying `com.eric.macautraffic` on that phone returned `CFBundleVersion = 3`. The local package is `ios/build-device/MacauTraffic-build3.ipa`. The project does not commit signing credentials or device identifiers.

The development profile expires at 2026-11-22 17:56 UTC (2026-11-23 01:56 Macau time), after which the app needs signing and installation again. The IPA SHA-256 is `d972ee4368b017894e597834a069c702e5bc52a7d2006a11fa25d718581c2857`.

Xcode CoreDevice's tunnel failed on this host. Direct USB installation succeeded through libimobiledevice. Automatic launch remained unavailable because the debugserver/developer disk image connection was unavailable. Installation is confirmed; an observed physical launch, microphone quality, field location, live camera playback, battery usage and gesture performance are not claimed. Open 澳門出行 on the phone to use the installed development build. TestFlight and App Store distribution were not performed.

## Screenshots

These are real simulator captures. Transport/API responses in UI tests use dated or explicitly synthetic fixtures; they do not establish live data accuracy. MapKit supplies the basemap. The phone images show the final compact design; the Build 3 change affects relocated-stop walking steps.

- [Chinese assistant](assistant-zh.png), [Explore](explore-zh.png), [City](city-zh.png).
- [Dark assistant](assistant-dark.png), [large text](assistant-large-text.png), [journey](journey.png), [trip editor](trip-editor.png).
- [iPad assistant](ipad-assistant.png), [iPad journey](ipad-journey.png).

## Boundaries

Native SF Symbol vehicles replace the website's 3D models and bounded position extrapolation. Manual routing reuses the existing pure TypeScript algorithms through JavaScriptCore; there is no embedded website. Source-dependent estimates, dated walking geometry and qualitative border status retain their existing limits. Live train tracking was not added. Development signing and the backend/provider remain external runtime dependencies.
