# Journey service hours and vehicle positions

Date: 2026-11-11

The bus network adapter joins a reviewed service-hours snapshot to the existing DSAT stop-order snapshot. Review the route sheets at [DSAT's bus-route directory](https://www.dsat.gov.mo/dsat/bus_route.aspx) when updating the file. Keys with a direction suffix apply only to that direction. Only transcribe windows that apply on all days. Day-specific, holiday and temporary arrangements are outside this snapshot.

The browser compares the selected Macau local time with first and last departures from the terminus for both legs. Unknown hours stay visible with an unverified label. The planner does not have stop-level schedules or timed-transfer data.

The existing per-route ETA endpoint still supplies geometry and estimates. The new optional `positionSource` field distinguishes actual feed entries from approached-stop fallbacks and permits older cached payloads. The journey map displays fresh feed estimates for both directions and keeps the camera fitted to the selected trip. Geometry is validated for each leg independently. A transfer coordinate disagreement produces two markers and a warning. A gap between published segments is left open.
