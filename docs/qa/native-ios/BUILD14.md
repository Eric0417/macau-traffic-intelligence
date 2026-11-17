# Macao Move Build 14 verification

17 November 2026. The bus tab is first and selected at launch. The Explore map fills the screen behind the controls. Directions and operating hours share a route detail section. Stop rows have padding above and below the labels, and the route line connects through the vehicle rows.

Typecheck, lint and 264 repository tests passed. The iPhone suite passed 48 native unit tests and eight UI tests, including applying an assistant route to the map, switching traffic layers and opening the bus map from a vehicle row. Simulator checks used fixture data for arrival estimates and vehicle positions. The iPhone SE run verified the four-column layout at launch, bus search and the full-screen dark map. See the [iPhone simulator preview](build14-overview.jpg).

The development-signed IPA is `ios/build-device/MacaoMove-build14.ipa`, SHA-256 `f466c7db38cfc9967652a66de87f99a7c2ef8fc8e5e37935a33620bc8dbedef3`. The app passed strict signature and archive checks.

CoreDevice initially blocked installation while the paired iPhone was locked. After unlock, USB installation completed and a separate app inventory query returned build 14.
