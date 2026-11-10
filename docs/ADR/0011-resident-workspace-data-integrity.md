# ADR 0011: Resident workspace and evidence boundaries

Date: 2026-11-10. Status: accepted for this implementation.

## Context

The resident workflow needs stop-level waiting information, parking by vehicle type, usable touch navigation and readable map models. The previous interface labels keyword-classified DSAT announcements as live incidents. Border status codes are converted into fixed waiting minutes in application code; an invalid parking timestamp becomes the current time.

## Decision

Keep the existing runtime, cache and v1 route family. Replace the duplicated desktop/mobile panels with one responsive workspace. Mobile users switch between a list and map; desktop users see both. Store only explicit favourites and appearance locally. Geolocation stays in browser memory.

Return null for information the publisher has not provided or whose meaning has not been verified. Preserve the nullable border waiting-time field for compatibility but do not derive minutes from status codes. Allow null parking source timestamps when parsing fails. Show retrieval and publication/observation time separately.

Treat DSAT notices and any added government news feed as published announcements. Keyword classification is a browsing aid, never an event timestamp, ongoing-event confirmation or complete incident feed. No announcements means no retrieved announcements, not no accidents.

Rebuild operator-livery buses, bus-stop signs and LRT platform markers as explicitly schematic 3D assets. Official coordinates do not establish a measured building footprint, sign bearing or vehicle-model identity. Use 2D by default and retain flat markers when 3D is unavailable.

## Consequences

Clients must accept null parking timestamps and show unknown values honestly. Consumers retain the existing normalized payload shape. New source adapters require real-response inspection, fixtures, attribution and a DATA_SOURCES entry. Native mobile applications, historical predictions, paid event services and unverified full-network journey planning remain separate work.
