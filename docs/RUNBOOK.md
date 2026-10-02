# Runbook

## Health

`GET /api/v1/health` returns service status and the active cache backend.

Production must report `"cache": "redis"`. A memory cache in production means `REDIS_URL` is missing or Redis was unreachable at process start.

## Source Failure

1. Inspect the response `meta.stale` and `meta.updatedAt`.
2. Run `npm run verify:sources` from a trusted local machine.
3. Check whether only the affected source failed. One failed source must not block the map or other panels.
4. If the upstream shape changed, update its adapter, fixture, contract if needed, and `docs/DATA_SOURCES.md`.
5. Record the behavior or schema change in `CHANGELOG.md`.

## Border Degradation

The FSM platform uses a WAF. A blocked request is expected to produce a failed optional smoke check. Confirm that the panel shows the last valid values with a delayed marker or the official link, and that all other modules remain available.

## Rollback

Use the Render dashboard to redeploy the last known good commit. The Key Value cache contains no user data and can be flushed without migration.

## Incident Checks

- Redis connection and memory pressure
- Render instance health and autoscaling events
- OpenFreeMap style availability
- Official camera HLS availability
- Upstream token format changes in `src/server/dsat-token.ts`
