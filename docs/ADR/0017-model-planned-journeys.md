# Model-planned journeys

Date: 2026-11-13

## Decision

The AI input sends natural-language trip requests to the configured model for destination extraction. The app resolves names against the dated place/stop catalogue, asks the user to choose ambiguous matches, and requests browser location for a resolved journey. If location fails, the user can enter an origin instead.

A server-only adapter computes direct, one-transfer and mapped walking candidates using the existing shared routing functions and cache sources. It removes candidates with reported suspended boarding/alighting stops. It sends the question, origin and destination coordinates, current Macau time, dated network information and candidate evidence to the model. JSON output selects candidate IDs and supplies a summary and reasons. The server validates the schema, uniqueness and candidate membership before returning normalized journeys. The UI renders alternatives and uses the existing map and live leg guidance. Invalid model output is a visible failure, never a local result presented as AI.

## Data boundary

For this user-requested workflow, precise browser location is sent to the application server and configured AI provider. UI text discloses this before submission. It is held in request/component memory, never cached, persisted or explicitly logged by the application. Parking distance calculations and the manual bus planner remain browser-only. The app makes no claim about the provider's retention policy.

The new POST /api/v1/assistant/journeys endpoint uses existing request identity/rate limits and no-store responses. Generic traffic questions continue through the existing assistant endpoint after model intent classification. This adds an endpoint within v1 without changing existing response contracts.

## Limits

Route candidates use dated DSAT stop order and OSM walking data. Indoor or disconnected endpoints may have no mapped connection to nearby stops; those bus access segments retain labelled straight-line distances and no invented walking geometry. Reviewed terminal hours are checked against now; unreviewed hours and missing/stale diversion checks remain explicit. The model cannot invent route geometry, stops, fare or arrival times. Live stop/vehicle checks continue when a journey is opened. JSON mode follows https://api-docs.deepseek.com/guides/json_mode/.
