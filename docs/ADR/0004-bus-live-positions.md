# ADR 0004: Bus Live Positions Come From The Official Station Feed

## Status

Accepted

## Context

The arrival system publishes two complementary public feeds used by the official Macau bus app:

- `/ddbus/app/passenger/route` returns the forecast arrival minutes for every stop on a route.
- `/macauweb/routestation/bus` returns, for each stop, the buses currently running towards it with plate, speed, accessibility flag, and status.
- `/macauweb/routestation/location` returns the official coordinates of each stop.
- `/ddbus/common/supermap/route/traffic` returns the official route polyline split per stop-to-stop segment together with each segment's traffic level, which is what the official map page draws.

DSAT does not publish raw GPS coordinates for individual buses. Positions are expressed as the segment between the previous stop and the stop a bus is approaching.

## Decision

Poll these official feeds only for the route and direction a user has selected, merge them in one adapter, and expose the result through the existing arrival endpoint. Draw each bus between the two official stops and label the position as an estimate between stops rather than a GPS fix.

Because DSAT reports the stop a bus is approaching and not its GPS fix, the map estimates the vehicle position at the midpoint of the official polyline for that stop-to-stop segment and rotates an isometric 3D bus icon to the segment bearing. Selecting a route puts the map in a focus mode that hides the camera, LRT, congestion, and 3D building layers so the route, its stops, and its buses stay readable.

## Consequences

- The map shows real vehicles, plates, low-floor buses, and speeds without inventing GPS precision.
- Vehicle markers are estimates along the official alignment; the UI states this in the panel.
- Seasonal routes that the arrival system omits are still listed, flagged as having no live tracking.
- An upstream failure degrades to the previous payload with `stale: true`; partial upstream failures still return whichever feeds responded.
- The route path is the official polyline from the map feed; DSAT also publishes printable route maps only as images.
- The route line is coloured by the official per-stop traffic level, which is the same signal the official route page shows.

## Superseded In Part

ADR 0005 replaces the midpoint estimate and the sprite icon. Stops are now matched by `stationCode`, route segments carry `fromStationCode` and `toStationCode`, vehicles approaching the same stop are spread along the segment, and the map renders GLB models in a MapLibre custom layer at the maximum street zoom.
