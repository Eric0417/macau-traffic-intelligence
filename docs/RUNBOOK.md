# Runbook

## Deployed Environment

| Item | Value |
| --- | --- |
| Render project | `Macau Traffic Intelligence` (`prj-davvc33tqb8s73dujto0`) |
| Environment | `production` (`evm-davvc33tqb8s73dujtp0`) |
| Web service | `macau-traffic-intelligence` (`srv-davv87qjnfac73d9gkc0`) |
| Public URL | https://macau-traffic-intelligence.onrender.com |
| Key Value | `macau-traffic-cache` (`red-davv7vqjnfac73d9fs90`), singapore, 256 MB, no persistence |
| Source | https://github.com/Eric0417/macau-traffic-intelligence (branch `main`, auto-deploy on push) |

The service runs two manually scaled instances in Singapore. Render only offers autoscaling
on Pro workspaces, so the `render.yaml` autoscaling block stays declarative until the
workspace is upgraded; scale with `POST /v1/services/{id}/scale` or the dashboard.

Useful commands:

```bash
render deploys list srv-davv87qjnfac73d9gkc0
render logs --resources srv-davv87qjnfac73d9gkc0 --limit 100
render restart srv-davv87qjnfac73d9gkc0
curl -s https://macau-traffic-intelligence.onrender.com/api/v1/health
```

## Deploy And Warmup

1. Push to `main` and let Render deploy.
2. Wait for both instances to report healthy, then run:

```bash
WARMUP_BASE_URL=https://macau-traffic-intelligence.onrender.com npm run warmup
```

The warmup primes every public source. `/api/v1/lrt/network` can take several seconds on the
first call because it rebuilds the network from OpenStreetMap; later calls are cached for 6 hours.

## Health

`GET /api/v1/health` returns service status, the active cache backend, and per-source failure counts.

Production must report `"cache": "redis"`. A memory cache in production means `REDIS_URL` is missing or Redis was unreachable at process start.

A non-zero failure count means that source fell back or failed recently. Counts reset after a successful fetch.

## Source Failure

1. Inspect the response `meta.stale` and `meta.updatedAt`.
2. Run `npm run verify:sources` from a trusted local machine.
3. Check whether only the affected source failed. One failed source must not block the map or other panels.
4. If the upstream shape changed, update its adapter, fixture, contract if needed, and `docs/DATA_SOURCES.md`.
5. Record the behavior or schema change in `CHANGELOG.md`.

The LRT network tries `overpass-api.de` and `overpass.kumi.systems` in order. Set
`LRT_OVERPASS_URL` to force a different mirror. When both fail, the server logs
`[lrt-network] live rebuild failed` and serves the checked-in network.

## Border Degradation

The FSM platform uses a WAF. A blocked request is expected to produce a failed optional smoke check. Confirm that the panel shows the last valid values with a delayed marker or the official link, and that all other modules remain available.

## Rollback

Use the Render dashboard, `render deploys` plus the rollback action, or push a revert commit to
`main`. The Key Value cache contains no user data and can be flushed without migration.

## Incident Checks

- Redis connection and memory pressure
- Render instance health and autoscaling events
- OpenFreeMap style availability
- Official camera HLS availability
- Upstream token format changes in `src/server/dsat-token.ts`
