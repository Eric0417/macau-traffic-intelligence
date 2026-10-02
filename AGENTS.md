<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Macau Traffic Intelligence Project Rules

## Start Every Session Here

1. Read `docs/PROJECT_MEMORY.md`, `docs/DATA_SOURCES.md`, and the latest entry in `CHANGELOG.md`.
2. Read the installed Next.js 16 documentation named in the managed block above before changing framework code.
3. Run `npm run typecheck`, `npm run lint`, and `npm test` before declaring a task complete.

## Data Source Rules

- Every external source must live behind a server-only adapter in `src/server/sources/`.
- Public route handlers may return normalized contracts only. Never return a raw DSAT, FSM, SMG, or MLM payload.
- Never expose source tokens, session cookies, or upstream host details to client bundles.
- Any source, field, endpoint, TTL, fallback, or attribution change must update `docs/DATA_SOURCES.md` and its tests in the same change.
- Use the cache layer in `src/server/cache.ts`. Do not add an ad hoc cache or fetch from a React component.
- Do not record or re-host camera streams. The browser plays the official HLS URL directly.
- Do not present LRT timetable inference as live train position data.

## Change Discipline

- Keep edits surgical and scoped to the requested behavior.
- Update `CHANGELOG.md` for user-visible behavior, public API, data source, cache, or deployment changes.
- Add an ADR in `docs/ADR/` before changing the runtime architecture, cache provider, public API version, or source policy.
- Update `docs/PROJECT_MEMORY.md` when the current state, known risk, or next-work list changes.
- Read a real source response before adding broad error handling based on imagined fields.

## Verification

- Unit and parser tests use fixtures and must not call government sites.
- Use `npm run verify:sources` only for deliberate live verification.
- End-to-end tests must mock public API routes and OpenFreeMap style requests.
- Never hide a source failure with invented or estimated values.
