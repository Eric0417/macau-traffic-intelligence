# Progressive journey results

Date: 2026-11-16

## Context

The native client waits for the entire assistant JSON response. A public journey probe took 21.8 seconds. Intent extraction, source lookup, suspension checks and model ranking run in sequence; native users see no route until the final model text is complete. The response already includes exact route records, so long generated boarding instructions duplicate the UI.

## Decision

Keep the existing JSON endpoint and add opt-in `Accept: application/x-ndjson` on the same POST. Validate and rate-limit before opening the stream. Emit phase changes at actual work boundaries, then at most three deterministic route candidates after the existing suspension checks. Label these as candidates awaiting AI comparison. The final event is the same normalized envelope as JSON clients receive. Errors stay explicit; a failed comparison never masquerades as an AI recommendation.

Clients can apply a checked candidate immediately and stop waiting, or wait for the ranked result. They discard late events after cancellation or a newer request. No source checks, freshness rules, provider identity or source policy change. Shorter ranking instructions keep route selection in the model and factual steps in the supplied route records.

Stream cancellation and request disconnection abort the provider fetch, including interpretation and itinerary calls. The stream starts without awaiting the entire planning promise so cancellation can run while ranking is pending. Source refresh callbacks are registered before candidates are emitted and deduplicated on completion; selecting an early candidate does not suppress canonical cache revalidation.

## Verification

Test early candidates while the ranking call is deliberately blocked, candidate membership and warnings, compatible JSON completion, stream failures and cancellation. Use named public landmarks for timing probes. Do not log questions, coordinates, keys or raw upstream payloads. Record first-candidate and final-result times separately.
