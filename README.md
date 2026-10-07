# 澳門交通情報

Live: https://macau-traffic-intelligence.onrender.com

Macau Traffic Intelligence is a map-first public transport dashboard for Macau. It combines live road congestion, bridge travel times, official HLS traffic cameras, bus arrivals, parking availability, weather warnings, border information, traffic notices, and the official LRT network.

The application is an independent implementation inspired by the architecture and open-source spirit of [HK Traffic Intelligence](https://github.com/keithligh/hk-traffic-intelligence). It does not reuse that project's source code.

## Stack

- Node.js 22 and Next.js 16 App Router
- TypeScript, React, Tailwind CSS
- MapLibre GL and OpenFreeMap
- HLS.js for official camera streams
- Zod contracts, Cheerio, fast-xml-parser
- Render Web Service with shared Render Key Value

## Local Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

Redis is optional locally. Without `REDIS_URL`, the cache uses an in-memory backend. Production uses Render Key Value so multiple instances share TTLs, locks, circuit state, and rate limits.

Next 16 allows one dev server per project and blocks dev assets from hostnames it did not start with. Open the app as `localhost`. If you need `127.0.0.1`, the origin is already allowed in `next.config.ts`. Playwright reuses an existing server on `http://localhost:3100`; start it with `npm run dev -- --port 3100` before running `npm run test:e2e`, or let Playwright start it.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local Next.js server |
| `npm run build` | Build the production standalone server |
| `npm run typecheck` | Run TypeScript checks |
| `npm run lint` | Run ESLint |
| `npm test` | Run fixture-based unit and integration tests |
| `npm run test:e2e` | Run Playwright browser tests |
| `npm run verify:sources` | Deliberately check live public sources |
| `npm run warmup` | Warm the deployed API cache (set `WARMUP_BASE_URL`) |
| `npm run build:lrt` | Refresh the checked-in LRT network fallback from OpenStreetMap |
| `npm run docs:check` | Verify engineering memory and source registry coverage |

## Data Refresh

The server fetches live data at runtime, so a redeploy is not needed when a source changes. Bus routes and the LRT network refresh every 6 hours, bus arrivals every 10 seconds, roads every 60 seconds, parking every 30 seconds, and notices every 5 minutes. The LRT network is rebuilt from OpenStreetMap route relations with the checked-in `data/lrt-network.json` as fallback.

After a deploy, run `WARMUP_BASE_URL=https://macau-traffic-intelligence.onrender.com npm run warmup` so the first real visitor does not wait for the cold LRT rebuild. The health endpoint also reports per-source failure counts.

## Public API

All response bodies use `{ data, meta }`. `meta` reports the source, source timestamp, generated time, TTL, and whether the payload is stale.

```text
GET /api/v1/traffic/roads
GET /api/v1/traffic/bridges
GET /api/v1/traffic/notices
GET /api/v1/cameras
GET /api/v1/bus/routes
GET /api/v1/bus/routes/{routeCode}/eta?direction=0|1
GET /api/v1/parking
GET /api/v1/weather
GET /api/v1/borders
GET /api/v1/lrt/network
GET /api/v1/lrt/notices
GET /api/v1/health
```

The API is read-only and rate limited. It does not provide bulk historical exports.
The bus ETA payload also carries stop coordinates and the live vehicles the official station feed reports for that route.

## Deploy To Render

The repository contains `Dockerfile` and `render.yaml`. The blueprint creates:

- A Docker Web Service running at least two instances
- A private Render Key Value instance used only as shared cache
- `/api/v1/health` as the health check

Set the required source flags from `.env.example` only when a source must be disabled. No source credentials are required.

## Data Notes

- DSAT road, bridge, camera, bus, and parking feeds are public-facing feeds used by official DSAT web applications. Some are not formally documented and may change.
- Weather comes from official SMG RSS.
- Border information is a best-effort extraction of the Public Security Police live platform. The service keeps stale values visible with a delayed marker when that source blocks automated access.
- LRT has no confirmed official live train-position API. The map shows the official network and official notice RSS only.
- The map draws the full street network in grey; only the 1,268 segments DSAT monitors carry a congestion status.
- DSAT reports buses per station segment rather than raw GPS, so live bus markers are placed between the previous and approaching stop.
- The selected bus route is drawn from the official `route/traffic` polyline and coloured by the official traffic level of each segment.
- Focusing a bus route hides the camera, LRT, congestion, and 3D building layers, keeps the route stops labelled, and shows buses as rotated 3D icons placed by estimating progress along the official segment.
- The 3D map can be rotated and tilted freely; the compass in the navigation control resets the bearing.
- At street zoom, buses and the selected LRT line switch from icon markers to rough extruded 3D models painted after the operators' current liveries (TCM orange/white, Transmac yellow/blue, LRT "Ocean Cruiser" pale blue with orange wave). The train model is a static showcase because no official live train position exists.
- Route buttons only warn about real suspensions reported by the diversion feed, not the raw `routeChange` flag.
- The LRT tab selects a line, highlights its stations on the map, and lists them with interchange badges; no live train positions are shown because DSAT/MLM publish none.
- The 3D view uses extruded OpenFreeMap buildings and AWS Open Data terrain tiles; it can be switched off in the layer menu.
- Camera streams are not recorded or proxied.

The application code is MIT licensed. Data remains subject to the terms and attribution requirements of its publishing organisation.

## Attribution

Architecture and product direction were inspired by [HK Traffic Intelligence](https://github.com/keithligh/hk-traffic-intelligence) by Keith Li. See `LICENSE` and `docs/PROJECT_MEMORY.md`.
