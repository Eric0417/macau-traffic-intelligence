# Macau Traffic for iOS

Native SwiftUI client for iPhone and iPad, requiring iOS 26 or newer. Open `MacauTraffic.xcodeproj` and run the `MacauTraffic` scheme. The checked-in project needs no CocoaPods or Swift package download. This revision was built with Xcode 27.2.

The interface uses system navigation, interactive back gestures, sheets, MapKit and AVKit. Controls use a neutral palette and Liquid Glass; route and congestion colors keep their transport meaning. The user requested the restrained controls and transitions of the ChatGPT iOS app. Explanatory copy is behind disclosure controls. The icon is an original monochrome route arrow generated with GPT Image and exported as an opaque 1024-pixel PNG.

## Modules

| Area | Native behavior |
| --- | --- |
| Explore | Apple map, monitored road overlays, explicit location action, manual journey search |
| Buses | Full catalogue, route/direction search, stops, suspensions, estimated arrivals, official vehicle estimates, speeds, congestion and saved routes/stops |
| Manual planner | Local place/stop search, pedestrian graph, direct buses and up to three transfers, exact shared geometry validation |
| Assistant | Destination and origin choices, typed/location origins, nearby facilities, traffic answers, ordered trips, day-trip alternatives and editable visits |
| Voice | Permission-based recording up to 20 seconds, PCM WAV upload, editable transcript, cancellation and temporary-file cleanup |
| City | Seven parking categories, LRT lines/stations/timetables, roads, bridges, weather, border conditions, notices, news, cameras and source status |
| Saved and settings | Route direction and stop occurrence preserved; local favorites; Traditional Chinese, Simplified Chinese and English; system/light/dark appearance |

The app reads the existing production `/api/v1/` API. No source token or AI key ships in the client. Government adapters and caching remain in the Next.js server. Manual routing uses the website's pure routing functions bundled into JavaScriptCore on a background queue. No WebView is used.

MapKit replaces the web basemap. Apple Maps walking links disclose endpoint sharing. Native map markers replace the web's animated 3D bus models; positions use the official feed without client extrapolation. LRT timetables are not live train positions. Arrival estimates retain their uncalibrated-system-estimate label.

## Rebuild

From the repository root:

```sh
npm ci
npm run build:ios-planner
xcodegen generate --spec ios/project.yml
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project ios/MacauTraffic.xcodeproj -scheme MacauTraffic \
  -destination 'platform=iOS Simulator,name=Macau Traffic QA' \
  -derivedDataPath ios/build CODE_SIGNING_ALLOWED=NO test
```

XcodeGen is needed only when changing `project.yml`; the generated Xcode project is committed. Select your own signing team in Xcode for device installation. Development-signed IPAs work only on devices authorized by their provisioning profile and expire with that profile. App Store distribution is separate.

## Data and verification

Normal launches use production. Only Debug builds with `--uitesting` or `MACAU_FIXTURES=1` load bundled fixtures. Tests refresh fixture envelope timestamps for deterministic freshness checks. Synthetic assistant and walking fixtures are identified in their source metadata and never serve as a production fallback. Standard unit/UI tests do not call government APIs.

`scripts/live-check.swift` is a separate, deliberate production check using the same Swift URLSession client and Codable models. It submits a synthetic public-landmark journey without a personal position. It is not run by the test suite.

See [verification](../docs/qa/native-ios/VERIFICATION.md), [source registry](../docs/DATA_SOURCES.md) and [ADR 0024](../docs/ADR/0024-native-ios-client.md).
