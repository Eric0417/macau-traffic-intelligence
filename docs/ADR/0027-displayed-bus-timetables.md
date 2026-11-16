# Displayed bus timetables

Date: 2026-11-16
Status: Accepted

The native route detail needs operating hours, including split service periods and weekday restrictions. The planner's reviewed `bus-service-hours.json` only covers all-day schedules for selected routes and cannot supply this display.

Add a separate, reviewed snapshot of the DSAT route posters to `data/bus-timetables.json`. The existing server-only bus catalog adapter attaches an optional normalized `timetable` to published routes. Each timetable retains its official page, review date, day restriction, destination label where needed, and separate operating periods or fixed departures. Missing entries remain unknown. The bus catalog retains its six-hour TTL and receives a new cache version.

These are terminal departure schedules, not arrival predictions or live operating status. They do not cover temporary diversions, special-event extensions, or typhoon suspensions. The client links the official timetable and shows when the snapshot was checked. It does not infer whether today is a holiday. This display snapshot does not change the planner's service-window policy or filtering.

The API remains v1. Existing clients can ignore the optional field. The native client accepts responses without it.
