# Macao Move Build 7 verification

Date: 2026-11-16

The home gradient and large title are removed. The destination capsule has a complete tap area. Assistant opens without keyboard focus and displays one pulsing dot while waiting; Stop remains available, and Reduce Motion disables the pulse.

Bus detail shows a person only at the closest unsuspended stop on the current route when the coordinate is at most 30 seconds old and distance plus horizontal accuracy is at most 50 m. The request waits past coarse fixes. Locations outside a valid reported route segment use approaching-stop wording. Vehicle rows share a leading edge; map and illustrative RealityKit model follow the lists.

The catalog exposes 90 reviewed display timetables. Split periods, destination labels, fixed departures and public/mandatory/university holiday restrictions remain distinct. Unknown routes remain unverified. The official source and review date are in the information sheet. This does not change planner filtering. See [timetable evidence](timetables/README.md).

Repository checks: typecheck, lint, 42 files / 260 tests, production build, and docs check passed. Native units: 37 passed, including distance/accuracy/age, repeated stop identity, coarse GPS fixes, midnight schedules and off-route vehicle locations. The complete iPhone suite passed 17 UI flows at 08:49 (GPS-specific flow is run separately). The GPS flow passed at 08:45 with the simulator placed at C690/6; 50 m boundary, uncertainty, stale and missing positions are unit-tested. The final iPad run passed all 37 units and both changed assistant/bus flows at 08:49. Screenshots show the waiting dot, timetable, aligned vehicle rows, bottom map and rendered model. Release compilation passed. Installation and deployment receipts are pending.

The first UI pass exposed an unresponsive blank area inside the home capsule; a content shape fixed it and the same tap now passes. iPad scrolling in the new test needed an edge drag to avoid the interactive model/map; the test was corrected. No production location or route values are synthesized for these tests. Fixture bus plates are test-only.

Simulator tests do not establish outdoor phone GPS accuracy, physical scrolling frame rate, or battery use. The bus feed supplies estimated positions, not verified GPS telemetry.

Result bundles: iPhone full suite `2026.11.16_08-45-59`; GPS `08-44-58`; final iPad `08-48-59`. Local result bundles are excluded from git. A review caught unvalidated vehicle-to-segment wording and a missing VoiceOver traffic status; both fixes passed a second source review. The off-route regression passed in the final iPad unit run.
