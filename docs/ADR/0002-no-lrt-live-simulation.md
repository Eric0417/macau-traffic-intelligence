# ADR 0002: No Simulated LRT Live Data

## Status

Accepted

## Context

Official MLM pages publish route information, timetables, service hours, and notice RSS. No stable official train-position or next-train API was verified. Third-party projects explicitly label their values as timetable estimates or simulations.

## Decision

Show the official LRT network and notice RSS only. Do not show train positions, remaining stops, or arrival countdowns.

## Consequences

- The product avoids presenting estimated values as live data.
- LRT still provides route context and operational alerting.
- Live arrivals can be reconsidered only if an official feed is found and verified.
