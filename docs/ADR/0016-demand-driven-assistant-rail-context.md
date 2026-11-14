# 0016: Read rail context for rail questions

Date: 2026-11-13

Status: Accepted

A standalone-server news question exceeded 45 seconds before reaching the provider because snapshot assembly always requested the remote LRT network. The Overpass adapter permits 60 seconds per endpoint and tries multiple endpoints.

Request that network only when the question explicitly mentions rail or an existing named line. News, weather and bus questions retain their relevant cached sources and receive `lrt: null`. No LRT facts are inferred when that context is absent. Rail questions keep the existing source, cache and fallback path.

This changes assistant context selection, not the public LRT API or its TTL. Offline tests verify a news question does not call the network source and a named-line question still does.
