# ADR 0007: The AI Assistant Reads The Normalized Live Data

## Status

Accepted

## Context

The platform serves live traffic data to the public. Residents, visitors, and classrooms also need help reading the data: which bridge is slow, how weather relates to congestion, what a bus arrival feed can and cannot answer. The 2026 competition that this work supports requires an AI function that operates in practice, and the project rules require every external source to sit behind a server-only adapter.

The assistant needs current facts. Raw government payloads are large, undocumented in places, and unsuitable to send to a model. The app already normalizes every source into Zod-validated contracts behind `src/server/cache.ts`.

## Decision

`src/server/sources/assistant.ts` adds an AI assistant that talks to any OpenAI-compatible chat completions endpoint. Defaults point at DeepSeek; `ASSISTANT_BASE_URL`, `ASSISTANT_MODEL`, and `ASSISTANT_API_KEY` switch providers. The key stays server-side.

- The server builds a compact JSON snapshot from the cached normalized sources: road status counts and congested segments, bridge travel times, weather and warnings, parking availability, border status, active notices, LRT notices, and, when the user has focused a bus route, that route's arrivals. Raw payloads are never forwarded.
- The prompt fixes the roles: answer in the requested locale, use only the snapshot for current facts, cite the snapshot time, explain rather than conclude (short answer, how to read the data, then a next check or a small task), keep units, never request personal data, and stay under 220 words.
- `POST /api/v1/assistant` validates the request with a Zod schema, applies the shared per-identity rate limit plus a stricter assistant rate limit, and returns the answer with the model name, snapshot time, and a human-readable summary of the data that grounded it. Answers are not cached.
- Missing API key or `SOURCE_ASSISTANT_ENABLED=false` disables only the assistant; the route answers 503 and every other module keeps serving.

## Consequences

- Students see which live data an answer used, so a wrong or out-of-scope answer is visible and can be discussed in class.
- Grounding reduces but does not remove model errors. The UI presents answers as explanations of the live snapshot, not as authoritative travel advice.
- Each answer costs a provider call. The assistant rate limit bounds cost, and no question or answer is stored by the server.
- The assistant is a new external source in `docs/DATA_SOURCES.md`; model or provider changes are configuration, not a data-contract change.
