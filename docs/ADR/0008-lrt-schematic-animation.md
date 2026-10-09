# ADR 0008: The LRT Train Is A Labelled Schematic Animation

## Status

Accepted

## Context

ADR 0002 stopped the product from showing LRT train positions because no official live feed exists. The 2026-10-09 product review asked for the train to move on the map so the selected line and its direction are easier to read.

## Decision

The selected LRT line shows one train that moves along the official line geometry at a fixed schematic speed of about 35 km/h. The train is not live data:

- The map labels the train "Schematic animation, not live positions" in the interface language.
- The LRT panel says the same, and no countdown, remaining stops, or arrival time is shown.
- The speed is fixed for display. It is not derived from a timetable, an ETA, or any feed.
- The train hides when the LRT layer is switched off or when a bus route is focused.

## Consequences

- The product still makes no live-position claim for the LRT.
- ADR 0002 is superseded only where it forbids a labelled schematic animation. Presenting simulated values as live data remains forbidden.
- If an official live LRT position feed is verified, the schematic is replaced by real positions and this ADR is revisited.
