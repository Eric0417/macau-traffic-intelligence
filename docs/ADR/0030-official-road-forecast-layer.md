# Official road forecast layer

Date: 2026-11-16

Explore has a separate 30-minute outlook from DSAT's public Traffic Situation map. The server reads the same road geometry and forecast used by that page, validates the forecast index, and joins by publisher road section ID. A missing value stays unknown. The geometry refreshes every six hours through the shared cache; forecast data refreshes on demand every minute. The map labels the result as a forecast and uses dashed strokes. The same live road button opens the selected layer.

The issue time is unavailable in the upstream road response. The source time shown by the app is retrieval time. The UI withdraws aged forecasts. This data is separate from current traffic, bus arrivals, route ranking and assistant live facts. It describes road sections, with no inferred turn or intersection-wide status.
