# Native iOS client

Date: 2026-11-16

## Decision

Add an iOS 26 application in `ios/`, using SwiftUI, MapKit, Core Location and AVKit. The existing Next.js service remains the data and AI backend. The app reads normalized `/api/v1` envelopes. Government adapters, credentials, shared caching and source policy remain on the server.

Apple Maps supplies the native basemap through MapKit. Its labels and built-in attribution stay visible. DSAT road overlays remain limited to the monitored segments. OSM-derived walking and LRT geometry retain their separate attribution. The native client plays official camera HLS directly and does not record it.

SwiftUI owns every screen. The deterministic bus and pedestrian search functions already used by the website are bundled into JavaScriptCore for local manual planning. This avoids maintaining a second routing algorithm and does not embed the website. The checked-in bundle is generated from the shared TypeScript and tested against the same fixtures. Planning runs on a serial background queue.

Use native tab bars, toolbars, sheets, SF Symbols and system typography. Liquid Glass belongs to controls and navigation; reading surfaces use system backgrounds. Respect Dynamic Type, Reduce Motion and Reduce Transparency.

Only favourites, language and appearance persist. AI prompts, responses, drafts and location stay in memory. Location is requested after an explicit action. The AI screen explains provider sharing before a location-assisted request. Recordings require microphone permission, are limited to 20 seconds, and are deleted after transcription or cancellation. Audio is sent only to the existing transcription endpoint.

Poll visible modules only, cancel requests when a view disappears, pause in the background, and keep source retrieval time separate from publication time. A failed or aged bus response hides live estimates and markers. Unknown values remain unknown. LRT has no live train claim.

## Verification

Build the simulator and device targets. Test contract decoding, delayed data, request encoding, local routing and UI navigation with fixture responses. Inspect real simulator screenshots. Run the repository typecheck, lint and tests. Record physical-device, signing and distribution status separately from simulator results.
