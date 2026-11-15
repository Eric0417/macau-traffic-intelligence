# System bus arrival estimates

Date: 2026-11-15

## Decision

The user requested arrival-minute predictions and position estimates driven by speed and congestion. Keep the official stop counts and coordinates, and add separately labelled system estimates. This extends ADR 0010; passenger-flow statistics remain excluded.

The estimator uses the integrated DSAT route polylines, per-vehicle reported speed, coordinates and segment traffic levels. Coordinates are upstream estimates, not measured GPS. Match a vehicle against the incoming and outgoing segments of its reported stop, because observed route 56 responses place some vehicles on the outgoing segment. Reject matches more than 100 metres from those segments.

Use the previous normalized snapshot from the existing shared cache to track unchanged coordinates and, when reported speed is missing, estimate speed from forward progress on the same segment. No additional cache or provider is introduced. Retrieval time is not a vehicle measurement timestamp. Limit position extrapolation to 15 seconds from the last changed coordinate and never pass the next stop. Stop extrapolation immediately when reported speed is zero. Withhold minutes after 30 seconds of unchanged position, missing speed, disconnected geometry or suspended stops.

Arrival time sums remaining segment distance divided by model speed, plus 20 seconds per intermediate stop. Traffic levels 1–4 cap speed at 28, 18, 10 and 5 km/h. The current segment uses reported/observed speed capped by traffic; future segments blend 60% of that speed and 40% of the traffic cap. Unknown traffic retains the measured speed. These are explicit, uncalibrated model parameters, not official timings or confidence intervals. Stopped vehicles do not receive a departure-time guess. Round up to whole minutes and label them system estimates. Show stop counts when estimation is unavailable. UI and assistant must suppress old estimates when the response is delayed.

## Verification

Fixture tests cover outgoing-segment matching, congestion, forward motion, zero speed, frozen reports, missing coordinates/speed, loop direction, geometry gaps, suspension and expired estimates. Browser checks cover selected-stop minutes and delayed-data fallback. Production checks must verify normalized estimate fields and their source timestamps. Accuracy against actual arrivals remains unmeasured and must not be claimed in the project defense.
