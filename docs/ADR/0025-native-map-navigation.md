# Native home map and journey application

Date: 2026-11-16

## Context

Build 3 opened assistant route results in isolated detail sheets. The user expects applying a route to return to the home map. The SwiftUI map also loses its current camera after user gestures, and its road layer creates one SwiftUI map item per monitored segment. The old test fixture contained only 30 segments.

## Decision

Keep selected tab and applied journey in a scene-owned observable navigation state. Explore owns the active journey's map and a compact route panel. Detail pages use the standard navigation stack; modal details keep system drag-to-dismiss. Do not add global swipe recognizers that compete with map panning.

Use MapKit's native map view behind the shared SwiftUI map component so it retains the actual camera and can batch distinct polylines with the same visual style into MKMultiPolyline overlays. Camera commands have an identity separate from their target coordinate, allowing repeated location and fit actions. Overlay refreshes do not reset the camera. UI controls live in a stable overlay outside the map's gesture surface.

The existing server-only sources, normalized contracts, freshness rules and geometry verification remain authoritative. A selected journey contains no fabricated route geometry. Missing route segments and uncertain walking connections stay distinguishable.

## Verification

Use the complete captured normalized road response for offline performance comparisons. Add camera, repeat focus, same-style grouping, home application, dismissal and voice-state regressions. Record measured results and physical installation separately in the native QA record.
