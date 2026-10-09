# ADR 0002: No Simulated LRT Live Data

## Status

Superseded by ADR 0008 for the labelled schematic animation only; everything else stands.

## Context

Official MLM pages publish route information, timetables, service hours, and notice RSS. No stable official train-position or next-train API was verified. Third-party projects explicitly label their values as timetable estimates or simulations.

## Decision

Show the official LRT network and notice RSS only. Do not show train positions, remaining stops, or arrival countdowns.

Amendment (2026-10-09): ADR 0008 allows one train that moves along the selected line as an explicitly labelled schematic animation, with no live-position claim, countdown, or timetable inference.

## Consequences

- The product avoids presenting estimated values as live data.
- LRT still provides route context and operational alerting.
- Live arrivals can be reconsidered only if an official feed is found and verified.
