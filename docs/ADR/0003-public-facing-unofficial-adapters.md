# ADR 0003: Public-Facing Unofficial Adapters

## Status

Accepted

## Context

Several DSAT and FSM browser applications call dynamic endpoints that are not listed as documented open APIs. The data is publicly displayed, but endpoint stability and automated access are not guaranteed.

## Decision

Use server-side adapters with conservative cache TTLs, no browser tokens, no anti-bot bypass, no recording, and independent source kill switches. Preserve attribution and official source links. Do not provide bulk historical exports.

## Consequences

- The site adds substantially less upstream load than per-user direct polling.
- A source can be disabled without deploying a new frontend.
- Adapter breakage must be handled through fixtures, contracts, stale fallback, and documented maintenance.
