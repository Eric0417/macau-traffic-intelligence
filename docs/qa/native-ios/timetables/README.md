# Timetable snapshot review

Checked 2026-11-16 against the 90 routes in the [DSAT route directory](https://www.dsat.gov.mo/dsat/bus_route.aspx). `sources.json` records each fetched official poster URL, byte count and SHA-256. The display snapshot is `data/bus-timetables.json`.

Text was read with Apple Vision from the published posters. Contiguous frequency bands were combined only when their endpoints met. Different destinations, separated morning/evening service, weekday restrictions and fixed departures remain separate. Ambiguous OCR for 1A, 4, 16, 17, 32, 9A and direction labels for 102, 26A and MT4 were checked visually against the originals. Route 60 was also inspected visually. Route 28C uses its matching weekend window; route 50 joins the single daily timetable printed across two columns.

The snapshot excludes headways, temporary diversions, typhoon rules and special-event extensions. It does not classify public/mandatory/university holidays or drive planner filtering. A fresh catalog response does not mean its static timetable was rechecked. Missing routes remain unknown.
