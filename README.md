# 澳門交通情報

Live: https://macau-traffic-intelligence.onrender.com

Macau Traffic Intelligence is a map-first public transport dashboard for Macau. It combines live road congestion, bridge travel times, official HLS traffic cameras, live bus positions and stops-away counts, parking availability, weather warnings, border information, traffic notices, and the official LRT network.

The interface is a dark, data-first transit console: system typography, translucent dark materials, a single system-blue tint for interactive state, semantic status colours, a vertical navigation rail on desktop, and a bottom tab bar with a draggable sheet on mobile. It is a web approximation of Apple's design guidance, not an Apple component kit, and it uses the platform system font on Apple devices with a matching sans fallback elsewhere.

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
| `npm run build:parking` | Refresh the DSAT car park coordinates from OpenStreetMap |
| `npm run docs:check` | Verify engineering memory and source registry coverage |

## Data Refresh

The server fetches live data at runtime, so a redeploy is not needed when a source changes. Bus routes and the LRT network refresh every 6 hours, live bus positions every 2 seconds, roads every 60 seconds, parking every 30 seconds, and notices every 5 minutes. The LRT network is rebuilt from OpenStreetMap route relations with the checked-in `data/lrt-network.json` as fallback.

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
POST /api/v1/assistant
```

The government-data API is read-only and rate limited. `POST /api/v1/assistant` accepts a question plus the UI locale, answers from a snapshot of the normalized live data, and stores nothing. No bulk historical exports.
The bus payload also carries stop coordinates, the position estimate the official report publishes per plate, and the stops-away count for each stop.

## Deploy To Render

The repository contains `Dockerfile` and `render.yaml`. The blueprint creates:

- A Docker Web Service running at least two instances
- A private Render Key Value instance used only as shared cache
- `/api/v1/health` as the health check

Set the required source flags from `.env.example` only when a source must be disabled. No government-source credentials are required. The optional AI learning assistant needs `ASSISTANT_API_KEY`; it also accepts `ASSISTANT_BASE_URL` and `ASSISTANT_MODEL` for any OpenAI-compatible endpoint. Without a key the assistant endpoint returns 503 and the rest of the app works unchanged. See `docs/ADR/0007-ai-learning-assistant.md`.

## Data Notes

- DSAT road, bridge, camera, bus, and parking feeds are public-facing feeds used by official DSAT web applications. Some are not formally documented and may change.
- Weather comes from official SMG RSS.
- Border information is a best-effort extraction of the Public Security Police live platform. The service keeps stale values visible with a delayed marker when that source blocks automated access.
- LRT has no confirmed official live train-position API. The map shows the official network and official notice RSS, and the train on the selected line is an explicitly labelled schematic animation, never live data.
- The map draws the full street network in grey; only the 1,268 segments DSAT monitors carry a congestion status.
- DSAT publishes no per-stop arrival minutes, and its bus report counts the stops remaining instead: 還有 N 站, 即將進站, 已進站. The panel shows those counts with the plate and a bus icon on the stop each bus is heading to. `/ddbus/app/passenger/route` is the half-hourly waiting-time/flow statistics feed and is not used as a countdown (ADR 0010).
- Live bus markers use the position estimate the official report publishes per plate and glide along the official route polyline toward the newest estimate at a bounded bus speed, so a coarse step is absorbed as motion instead of a jump; the publisher's positions are not GPS, and each marker states the stop its bus is approaching. A 3D/2D mode control in the layer menu switches to flat, enlarged livery-coloured markers when the 3D models are hard to read.
- The selected bus route is drawn from the official `route/traffic` polyline and coloured by the official traffic level of each segment.
- Focusing a bus route hides the camera, LRT, congestion, and 3D building layers, keeps the route stops labelled, and shows buses as rotated 3D icons placed at the position the official report publishes.
- The 3D map can be rotated and tilted freely; the compass in the navigation control resets the bearing.
- At street zoom, buses switch from livery-coloured markers to generic GLB models rendered at 1.8x display scale, and the selected LRT line shows its extruded schematic train. The bus models are painted after the operators' current liveries (TCM orange/white, Transmac yellow/blue, LRT "Ocean Cruiser" pale blue with orange wave). The train moves along the line as a labelled schematic animation; it is not a live position.
- Route buttons only warn about real suspensions reported by the diversion feed, not the raw `routeChange` flag.
- Each tab narrows the map to its subject: parking lists and maps the DSAT car parks (OpenStreetMap coordinates, ODbL, 78 of 92 matched), clicking one flies to it and highlights it, cameras show only camera markers, and Alerts highlights the monitored roads named in the selected incident.
- The Alerts tab leads with incident-classified DSAT messages (accidents, fires, flooding, fallen trees, collisions, urgent repairs); planned roadworks and diversions are collapsed below. There is no separate official real-time accident feed, and the Macau news portals block automated access, so DSAT special messages remain the source.
- The LRT tab selects a line, highlights its stations on the map, and lists them with interchange badges; no live train positions are claimed because DSAT/MLM publish none, and the moving train is labelled as a schematic animation.
- The 3D view tilts the camera and shows extruded OpenFreeMap buildings on a flat ground plane, so roads stay level; it can be switched off in the layer menu.
- Camera streams are not recorded or proxied.
- The AI learning assistant answers from a compact snapshot of the cached normalized data. When a question names a bus route or a road, that live detail is loaded first, and the official LRT network is included with the statement that no live train positions exist. Bus positions remain the publisher's own estimates, never GPS, and the assistant works with stops-away counts rather than invented minutes; route place questions are checked against the official stop list on the server. Answers can focus the map on the named bus route or LRT line, and a button opens the matching panel. The model never receives raw upstream payloads, credentials, or personal data. Answers are attributed to the configured model and are not stored.

The application code is MIT licensed. Data remains subject to the terms and attribution requirements of its publishing organisation.

## Attribution

Architecture and product direction were inspired by [HK Traffic Intelligence](https://github.com/keithligh/hk-traffic-intelligence) by Keith Li. See `LICENSE` and `docs/PROJECT_MEMORY.md`.
