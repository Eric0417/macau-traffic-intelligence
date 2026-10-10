# ADR 0010: Bus Report Uses Official Positions And Stops-Away Counts

## Status

Accepted

## Context

The bus panel read the passenger endpoint `/ddbus/app/passenger/route` and treated its `current` value as arrival minutes. A live check on 2026-10-11 showed that this endpoint is the passenger waiting-time/flow statistics feed, the data behind the official 乘客候車時間 page: it returns half-hour segments (`currentSeg`, `historyRange`) and per-stop `average`/`current` counts, and its values stayed frozen across a two-and-a-half-minute sample while buses moved through those stops at 40 km/h. The official language bundle renders the same feed under the waiting-time feature, and the official 巴士報站 widget counts the stops remaining instead of minutes.

DSAT publishes no per-stop arrival minutes. What it does publish:

- `routestation/bus`: the stop each live bus is approaching (`staCode`), with plate, speed, accessibility flag, and status.
- `routestation/location`: stop coordinates plus `busInfoList`, the publisher's own estimated position per plate. The official map page draws exactly these coordinates.
- The official stop widget (`/ddbus/common/route/collection/info`) counts the remaining stops per bus: 還有 N 站, 即將進站 (`x`), 已進站 (`0`), 未發車 (`f`).

## Decision

- Stop reading `/ddbus/app/passenger/route` in the adapter. Its counts are never presented as arrival minutes.
- Use the `busInfoList` coordinate as the vehicle position when the feed publishes one, and fall back to the coordinates of the stop the bus is approaching. The payload keeps `estimated: true`: these are the publisher's estimates, not GPS fixes.
- Carry `stopsAway` on each stop, computed from the approached stop sequence: `s - b` on line routes and wrapped on circular routes (`routeType: 2`). 0 means a bus is heading to that stop.
- The panel shows a bus icon, plate, and 即將進站 on stops a bus is heading to, the remaining-stop count on later stops, and a dash when no bus is en route from behind. This mirrors the official widget.
- The map still concatenates the official stop-to-stop polylines and glides markers along them, but it no longer rewinds a marker to the stop just reached when the feed advances, and it no longer derives any position from the statistics feed.

## Consequences

- Positions and counts match the official bus report at its own granularity.
- The app no longer claims a per-stop minute prediction that DSAT does not publish; the stop list shows 還有 N 站 instead.
- On line routes, stops behind every live bus show a dash because no bus is en route towards them yet.
- The public bus payload drops `etaMinutes`, `averageMinutes`, and `messageCode`, and adds `stopsAway`. The `/api/v1/bus/routes/{routeCode}/eta` path keeps its name for compatibility, but the `eta` segment now means the live bus view, not minutes.
- The AI assistant receives stops-away counts and is instructed not to convert them into minutes.
