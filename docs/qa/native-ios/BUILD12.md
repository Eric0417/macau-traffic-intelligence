# Macao Move Build 12 verification

16 November 2026. CoreDevice installed Macao Move on the paired iPhone 17 Pro. A separate query of installed apps returned version 1.0.0, build 12. The release passed signature and archive checks. The signed IPA is `ios/build-device/MacaoMove-build12.ipa`, SHA-256 `65929f118b92e02fcdc62d376e5f5799d931e9f9bf8299cf876c722bc4d3f8b9`.

The iPhone simulator passed 48 native unit tests and six UI tests. They covered both themes for the location button, the day-trip form and location permission, the manual origin after location denial, automatic language choice in Japanese, Korean, Portuguese and Spanish, the forecast without dashed lines or an Apple Maps traffic choice, and bus positions in the arrival list and map. The dark-mode screenshots showed readable labels on the Trip details and Share current location buttons. Location and tap tests used the simulator.

Render deployment `dep-dbtaa0l6e07s73bsu1r0` was live at `0e57847ec34b5ea3ca7480aa588ee12902ef2667`. The production forecast returned a fresh feature collection. A day-trip request with the origin left blank returned the location prompt. Sending coordinates for a public landmark returned three plans from that location to A-Ma Temple. Four live assistant questions received replies in the requested languages. The Japanese reply volunteered a fare rule without a source. These probes verified reply language and trip flow.

Typecheck, lint, 264 repository tests, documentation checks and the standalone build passed. The new languages cover native controls and permission prompts. Some fixed server text still falls back to English, and official names and notices use the languages available from their publishers.
