# ADR 0001: Shared Key Value Cache

## Status

Accepted

## Context

The production service runs at least two Render instances. Per-process memory would cause inconsistent TTLs, duplicate upstream requests, and ineffective rate limits.

## Decision

Use Render Key Value through `ioredis` for shared source cache, stale entries, request coalescing locks, circuit state, and per-IP rate limits. Keep an in-memory implementation only for local development and tests.

## Consequences

- Multiple instances observe one cache state.
- Redis loss degrades to process memory rather than failing the site.
- The application remains stateless and contains no user data.
