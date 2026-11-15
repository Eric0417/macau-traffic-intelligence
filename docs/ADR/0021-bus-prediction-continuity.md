# Bus prediction continuity

Date: 2026-11-15

## Decision

Extend ADR 0020 within the existing normalized ETA contract and shared cache. Route 56 recordings showed a stopped or stale nearest vehicle disappearing from prediction selection, which substituted a later bus without explanation. Expired forecasts also reverted to the adapter's incoming-segment index. The marker controller permitted reverse motion and could coast past a frozen target.

Cache version `system-prediction-v2` stores each vehicle's accepted segment, local and unwrapped route progress, first tracking time, last forward observation time, last processing time and filtered moving speed. Matching uses the vehicle ID, plate, route, direction and unchanged geometry. Positions stay within a forward window of 70 km/h times elapsed observation time plus 25 m, with 20 m backward tolerance. Matches remain within 100 m of the feed coordinate. These are rejection bounds, not confidence intervals. Route projection is limited to that window so crossings cannot select a distant section of the same polyline. A position must clear a stop by 20 m before the tracked segment advances. A report received out of order cannot replace newer state. After a gap over 60 s a changed coordinate starts a new track; unchanged coordinates retain their old observation time.

Select the nearest vehicle by remaining route distance, including vehicles without a usable minute estimate. A stationary bus within 60 m of the target stop has `arrivalStatus.state=near-stop`. This means estimated proximity and zero reported speed, not confirmed arrival. Other uncertain positions have `updating`. If a selected vehicle disappears completely, retain an updating status for at most 30 s before allowing a replacement. `nextBus` identifies a changed vehicle or next circuit. A missing time is never replaced silently with a later vehicle's time.

Filter moving speed with a 30 s exponential time constant; zero speed stops position extrapolation and withholds minutes immediately. Keep the prior moving-speed history for resumption. Smooth the absolute arrival timestamp with a 15 s time constant for the same vehicle and stop occurrence. A history up to 60 s can support this filter, but visible minute/status timestamps still expire after 10 s. Traffic caps, intermediate stop allowance and 15 s position horizon remain as in ADR 0020. Minute accuracy remains uncalibrated.

The map uses accepted tracking even when a forecast expires. It only moves forward toward the current target. A correction behind the displayed marker freezes movement until accepted progress catches up. A stopped target has zero animation velocity, so the controller cannot coast beyond it. A new track is placed at its accepted location without animating an invented trip. Filtered zero-length geometry retains original source indices.

No upstream endpoint, polling interval, cache backend or public API version changes. Additional contract fields are optional for older fixtures and clients. The assistant receives the same uncertainty statuses as the UI.

## Verification

Sequence tests cover braking, reversed reports, speed changes, stale and missing positions, stop-boundary jitter, confirmed passage, loop rollover, changed identities/geometry, delayed responses and zero-length segments. A 40-response route 56 fixture from 2026-11-15 exercises server prediction and map movement together. Browser tests check the one-minute, stationary, updating and replacement states on desktop and phone layouts. These checks establish regression behavior; they do not measure arrival error against buses observed at stops.
