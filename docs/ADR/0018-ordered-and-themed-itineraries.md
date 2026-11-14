# Ordered journeys and themed day trips

Date: 2026-11-14

## Decision

Keep one assistant input for a destination, ordered destinations and a themed day trip. Existing point-to-point responses remain compatible. New itinerary responses carry a validated draft, missing details or place choices, and complete alternatives with independent transport sections. User-specified destination order is preserved. Day trips ask for date, start/end time, start/end places and preferences before selecting attractions.

Reuse the existing bus and walking search for each adjacent pair. The first leave-now section checks current terminal hours and suspensions. Day-trip sections check reviewed terminal hours against their planned departure targets, without treating current suspensions as future service. Later ordered sections with unknown departure times do not filter against now. Current vehicle positions never imply future availability. Transport durations remain unknown. Suggested visits and their time windows are planning targets, not predicted arrivals; the UI exposes remaining unscheduled time and requires a departure-time service check.

A server-only `cultural-places` source reads a reviewed, checked-in catalogue through the shared cache. Names, opening rules and official links are reviewed separately from OSM coordinates. Model output may select only catalogue IDs. The server validates IDs, distinct alternatives, visit durations and opening-window feasibility. Known weekly closures are excluded conservatively because no public-holiday exception calendar is integrated. Source age, exceptional closures and unverified transport time remain visible.

## Data and runtime boundaries

Drafts and precise locations stay in request/component memory, with no-store responses. The existing provider, credentials and rate limits remain. Only normalized source evidence is sent to the provider. The map displays ordered destinations and the selected transport section; it never draws invented bus lines between destinations. Poll only the selected section's existing maximum two bus legs.

## Verification

Cover fixed order, repeated return destinations, place disambiguation and location recovery, missing day-trip details, closed venues, invalid model IDs, disconnected sections and edits. Preserve existing single-destination behavior. Verify desktop/mobile fixtures with mocked public routes and map styles, then verify the deployed application and provider separately.
