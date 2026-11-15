# Native iOS migration

## Build 4 correction and redesign

Build 3 was rejected after physical use on November 16. The earlier tests missed repeat location, camera continuity, production-sized traffic overlays, route application and voice feedback. Treat the existing verification as coverage of those named tests only.

1. Reproduce camera and traffic defects with the complete normalized road fixture, record a performance baseline, then preserve camera state and batch same-style map overlays.
2. Keep the selected journey in the root navigation state. Applying a plan must select Explore and fit the verified route on the home map. Use system push navigation and dismissible sheets.
3. Add audio metering with a bounded waveform, explicit send-state contrast and cancellable assistant waiting. Measure actual request latency before choosing an optimization.
4. Redesign the main surfaces around a map, large route numbers, concise trip steps and a single primary action. Reference Not Boring's six official app pages and ChatGPT's restrained composer. Keep source and uncertainty details accessible.
5. Run regressions for the reported flows, full native and repository checks, light/dark/large-type inspection and a second review. Install the signed update and record the remaining physical validation limits.

The user requested the whole Macau Traffic application as a native iOS app with a new Apple-style design. Target iOS 26; use the existing deployed API. The initial client reused the existing API. Build 4 adds an opt-in progressive response and requires deploying the matching server change.

November 16 release: Macao Move Build 6 is installed and independently identified on the iPhone. Server code `0c8af7a` is live. The final run passed 257 repository tests, 31 native unit tests and the assistant-to-home UI flow; the interface revision also passed all 15 iPhone UI flows and three iPad flows before the calculation-only follow-ups. Production first candidates now took about six seconds in the two final checks, with final AI comparison at about 7.3 seconds. Full receipts and physical-device limits are in `docs/qa/native-ios/VERIFICATION.md`.

1. Create the Xcode project, typed API client, preferences, native navigation and map. Verify a simulator build.
2. Add route search, directions, stop selection, estimates, route geometry, favourites and freshness. Test null, suspended and delayed cases.
3. Add local place/stop and walking/bus planning using the existing algorithm bundle. Verify shared fixture results and map geometry.
4. Add all assistant continuations, facilities, multi-stop/day-trip editing and audio transcription. Verify requests and representative fixture-driven interactions.
5. Add LRT, parking, traffic, bridges, weather, borders, notices, news, cameras and source status. Verify contracts, source attribution and independent failure states.
6. Inspect phone and tablet layouts, light/dark mode, large type and navigation. Run iOS and repository checks, review the changes and write delivery instructions.

Acceptance: native controls throughout, working API-backed flows for every existing module, no WebView shell, no fabricated live values, reproducible Xcode project and documented test evidence. App Store distribution and physical-device performance require separate verification.
