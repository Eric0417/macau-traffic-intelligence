# ADR 0005: Bus 3D Models Use A MapLibre Custom Layer

## Status

Accepted

## Context

MapLibre GL JS 6.11.2 has no native glTF model layer. The earlier sprite approach shipped as 32 PNG heading renders, but the inspection found two problems:

- The images are flat sprites, not 3D models.
- Keeping a 12 m bus visible at city zoom required scaling it far beyond its real size.

The bus feed also has no raw GPS. It reports the stop a vehicle is approaching, and the route feed provides one official polyline per stop-to-stop segment.

## Decision

Render buses as GLB models through a MapLibre custom WebGL layer. MapLibre and Three.js share the map canvas and WebGL2 context. The layer uses the official segment polyline, the vehicle bearing, and the terrain elevation available from the map.

The model uses true meter scale from z17 to z19. Above z19 it keeps a fixed on-screen size so it remains readable without filling the viewport. At lower zoom levels a screen-space marker and plate label carry the vehicle information. This keeps the model truthful at city zoom without making it unusable when the map is pushed further in.

Each vehicle transform is multiplied into the MapLibre projection matrix on the CPU in Float64 and rendered as its own draw call. The model ignores terrain depth and frustum culling. This avoids the Float32 precision collapse that made the GLB disappear above z19 and keeps the preview stable while zooming.

The map zoom ceiling is 24. MapLibre does not provide infinite zoom; this value allows the true-scale model to be inspected closely without changing model size.

The Blender source is committed as `docs/models/bus-models.blend`; runtime GLBs are `public/models/bus-tcm.glb` and `public/models/bus-transmac.glb`. The model is a generic two-axle bus. DSAT `busType` is exposed but not mapped to brands or models without a documented mapping.

## Consequences

- The map shows an actual 3D object only at the zoom where a real 12 m vehicle is large enough to read.
- The lower-zoom marker is explicitly a marker, not a mislabelled 3D model.
- The custom layer needs WebGL2 and successful GLB loading. If loading fails, markers and labels remain.
- The public bus payload adds `busType`, `fromStationCode`, and `toStationCode`.
- Any future model variant mapping must update the Blender source, the GLB exports, the contracts, and this ADR.
