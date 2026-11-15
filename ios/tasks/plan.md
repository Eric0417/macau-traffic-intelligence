# Native iOS migration

The user requested the whole Macau Traffic application as a native iOS app with a new Apple-style design. Target iOS 26; use the existing deployed API. No backend deployment is required for the client.

1. Create the Xcode project, typed API client, preferences, native navigation and map. Verify a simulator build.
2. Add route search, directions, stop selection, estimates, route geometry, favourites and freshness. Test null, suspended and delayed cases.
3. Add local place/stop and walking/bus planning using the existing algorithm bundle. Verify shared fixture results and map geometry.
4. Add all assistant continuations, facilities, multi-stop/day-trip editing and audio transcription. Verify requests and representative fixture-driven interactions.
5. Add LRT, parking, traffic, bridges, weather, borders, notices, news, cameras and source status. Verify contracts, source attribution and independent failure states.
6. Inspect phone and tablet layouts, light/dark mode, large type and navigation. Run iOS and repository checks, review the changes and write delivery instructions.

Acceptance: native controls throughout, working API-backed flows for every existing module, no WebView shell, no fabricated live values, reproducible Xcode project and documented test evidence. App Store distribution and physical-device performance require separate verification.
